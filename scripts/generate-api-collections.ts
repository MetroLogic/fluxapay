import fs from 'node:fs';
import path from 'node:path';
import { specs } from '../fluxapay_backend/src/docs/swagger';

type JsonRecord = Record<string, unknown>;

interface GeneratedFile {
  name: string;
  content: string;
}

interface GeneratedRequestBody {
  mimeType: string;
  mode: 'raw' | 'formdata' | 'urlencoded';
  text?: string;
  fields?: Array<{ key: string; value: string; type: 'text' | 'file' }>;
}

const outputDirectory = path.resolve(__dirname, '../fluxapay_frontend/public/api-collections');
const methods = new Set(['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace']);
const defaultBaseUrl = 'http://localhost:3000';

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asRecord(value: unknown, context: string): JsonRecord {
  if (!isRecord(value)) {
    throw new Error(`Expected ${context} to be an object.`);
  }
  return value;
}

function asArray(value: unknown, context: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(`Expected ${context} to be an array.`);
  }
  return value;
}

function resolveReference(spec: JsonRecord, reference: string): unknown {
  const normalizedReference = reference.startsWith('#components/')
    ? reference.replace('#components/', '#/components/')
    : reference;
  if (!normalizedReference.startsWith('#/')) {
    throw new Error(`Unsupported OpenAPI reference: ${reference}`);
  }

  return normalizedReference
    .slice(2)
    .split('/')
    .map((part) => part.replace(/~1/g, '/').replace(/~0/g, '~'))
    .reduce<unknown>((current, part) => {
      if (!isRecord(current) || !(part in current)) {
        throw new Error(`Unable to resolve OpenAPI reference: ${reference}`);
      }
      return current[part];
    }, spec);
}

function resolveObjectReference(spec: JsonRecord, value: unknown, context: string): JsonRecord {
  let result = asRecord(value, context);
  const seen = new Set<string>();

  while (typeof result.$ref === 'string') {
    const reference = result.$ref;
    if (seen.has(reference)) {
      throw new Error(`Circular OpenAPI reference while resolving ${context}: ${reference}`);
    }
    seen.add(reference);
    result = asRecord(resolveReference(spec, reference), context);
  }

  return result;
}

function exampleForSchema(
  spec: JsonRecord,
  value: unknown,
  seenReferences = new Set<string>(),
): unknown {
  if (!isRecord(value)) {
    return {};
  }
  if ('example' in value) {
    return value.example;
  }
  if ('default' in value) {
    return value.default;
  }
  if (Array.isArray(value.enum) && value.enum.length > 0) {
    return value.enum[0];
  }
  if (typeof value.$ref === 'string') {
    if (seenReferences.has(value.$ref)) {
      return undefined;
    }
    const nextReferences = new Set(seenReferences);
    nextReferences.add(value.$ref);
    return exampleForSchema(spec, resolveReference(spec, value.$ref), nextReferences);
  }

  switch (value.type) {
    case 'object': {
      const properties = isRecord(value.properties) ? value.properties : {};
      return Object.fromEntries(
        Object.entries(properties)
          .map(([name, property]) => [name, exampleForSchema(spec, property, seenReferences)] as const)
          .filter(([, example]) => example !== undefined),
      );
    }
    case 'array': {
      const item = exampleForSchema(spec, value.items, seenReferences);
      return item === undefined ? [] : [item];
    }
    case 'integer':
    case 'number':
      return 1;
    case 'boolean':
      return true;
    case 'string':
      if (value.format === 'email') return 'user@example.com';
      if (value.format === 'date-time') return '2026-01-01T00:00:00Z';
      if (value.format === 'uri' || value.format === 'url') return 'https://example.com';
      return 'string';
    default:
      return undefined;
  }
}

function parameterExample(spec: JsonRecord, parameter: JsonRecord): string {
  const example = parameter.example ?? exampleForSchema(spec, parameter.schema);
  if (example === undefined || example === null || typeof example === 'object') {
    return '';
  }
  return String(example);
}

function safeName(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, '_');
}

function operationId(operation: JsonRecord, method: string, route: string): string {
  return typeof operation.operationId === 'string'
    ? operation.operationId
    : `${method.toUpperCase()} ${route}`;
}

function operationTags(operation: JsonRecord): string[] {
  if (!Array.isArray(operation.tags) || operation.tags.length === 0) {
    return ['Other'];
  }
  return operation.tags.map((tag) => {
    if (typeof tag !== 'string' || tag.length === 0) {
      throw new Error('OpenAPI operation tags must be non-empty strings.');
    }
    return tag;
  });
}

function mergeParameters(
  spec: JsonRecord,
  pathParameters: unknown,
  operationParameters: unknown,
): JsonRecord[] {
  const parameters = new Map<string, JsonRecord>();
  for (const [source, list] of [
    ['path', pathParameters],
    ['operation', operationParameters],
  ] as const) {
    if (list === undefined) continue;
    for (const item of asArray(list, `${source} parameters`)) {
      const parameter = resolveObjectReference(spec, item, `${source} parameter`);
      if (typeof parameter.name !== 'string' || typeof parameter.in !== 'string') {
        throw new Error(`OpenAPI ${source} parameter is missing its name or location.`);
      }
      parameters.set(`${parameter.in}:${parameter.name}`, parameter);
    }
  }
  return [...parameters.values()];
}

interface AuthParameter {
  key: string;
  value: string;
  location: 'header' | 'query';
}

function authParameters(spec: JsonRecord, operation: JsonRecord): AuthParameter[] {
  const requirements = operation.security ?? spec.security;
  if (requirements === undefined) return [];
  const security = asArray(requirements, 'security requirements');
  if (security.length === 0) {
    return [];
  }

  const securityRequirement = asRecord(security[0], 'security requirement');
  const schemes = asRecord(asRecord(spec.components, 'components').securitySchemes, 'security schemes');
  const parameters: AuthParameter[] = [];

  for (const schemeName of Object.keys(securityRequirement)) {
    const scheme = asRecord(schemes[schemeName], `security scheme "${schemeName}"`);
    const value = '{{apiKey}}';
    if (scheme.type === 'apiKey') {
      if (scheme.in === 'header' && typeof scheme.name === 'string') {
        parameters.push({ key: scheme.name, value, location: 'header' });
      } else if (scheme.in === 'query' && typeof scheme.name === 'string') {
        parameters.push({ key: scheme.name, value, location: 'query' });
      } else {
        throw new Error(`Unsupported API key location for security scheme: ${schemeName}`);
      }
    } else if (scheme.type === 'http' && scheme.scheme === 'bearer') {
      parameters.push({ key: 'Authorization', value: `Bearer ${value}`, location: 'header' });
    } else if (scheme.type === 'http' && scheme.scheme === 'basic') {
      parameters.push({ key: 'Authorization', value: `Basic ${value}`, location: 'header' });
    } else {
      throw new Error(`Unsupported OpenAPI authentication scheme: ${schemeName}`);
    }
  }

  return parameters;
}

function requestBody(spec: JsonRecord, operation: JsonRecord): GeneratedRequestBody | undefined {
  if (operation.requestBody === undefined) return undefined;

  const body = resolveObjectReference(spec, operation.requestBody, 'request body');
  const content = asRecord(body.content, 'request body content');
  const mediaType = Object.keys(content).find((type) => type === 'application/json')
    ?? Object.keys(content).find((type) => type.endsWith('+json'))
    ?? Object.keys(content).find((type) => type === 'multipart/form-data')
    ?? Object.keys(content).find((type) => type === 'application/x-www-form-urlencoded');
  if (!mediaType) {
    throw new Error(`Unsupported request body media type: ${Object.keys(content).join(', ') || '(none)'}`);
  }

  const media = asRecord(content[mediaType], `request body ${mediaType} content`);
  if (mediaType === 'application/json' || mediaType.endsWith('+json')) {
    const example = media.example ?? exampleForSchema(spec, media.schema);
    if (example === undefined) {
      throw new Error(`Unable to generate an example for ${mediaType} request body.`);
    }
    return { mimeType: mediaType, mode: 'raw', text: JSON.stringify(example, null, 2) };
  }

  const schema = resolveObjectReference(spec, media.schema, `${mediaType} request body schema`);
  const properties = asRecord(schema.properties, `${mediaType} request body properties`);
  const fields = Object.entries(properties).map(([key, propertyValue]) => {
    const property = asRecord(propertyValue, `request body field "${key}"`);
    if (property.format === 'binary') return { key, value: '', type: 'file' as const };
    const example = exampleForSchema(spec, property);
    if (example === undefined) {
      throw new Error(`Unable to generate an example for request body field "${key}".`);
    }
    return {
      key,
      value: typeof example === 'string' ? example : JSON.stringify(example),
      type: 'text' as const,
    };
  });

  return {
    mimeType: mediaType,
    mode: mediaType === 'multipart/form-data' ? 'formdata' : 'urlencoded',
    fields,
  };
}

function postmanUrl(route: string, parameters: JsonRecord[]): JsonRecord {
  const pathVariables: Array<{ key: string; value: string; description?: string }> = [];
  const segments = route.replace(/^\/+/, '').split('/').map((segment) =>
    segment.replace(/\{([^}]+)\}/g, (_match, name: string) => {
      if (name === 'merchantId') return '{{merchantId}}';
      const parameter = parameters.find((candidate) => candidate.in === 'path' && candidate.name === name);
      pathVariables.push({
        key: name,
        value: '',
        ...(typeof parameter?.description === 'string' ? { description: parameter.description } : {}),
      });
      return `:${name}`;
    }),
  );

  return {
    raw: `{{baseUrl}}/${segments.join('/')}`,
    host: ['{{baseUrl}}'],
    path: segments,
    ...(pathVariables.length > 0 ? { variable: pathVariables } : {}),
  };
}

function insomniaUrl(route: string): string {
  return `{{ _.baseUrl }}${route.replace(/\{([^}]+)\}/g, '{{ _.$1 }}')}`;
}

function buildArtifacts(): GeneratedFile[] {
  const spec = asRecord(specs, 'OpenAPI specification');
  const paths = asRecord(spec.paths, 'OpenAPI paths');
  const info = asRecord(spec.info, 'OpenAPI info');
  const servers = Array.isArray(spec.servers) ? spec.servers : [];
  const firstServer = servers.length > 0 ? asRecord(servers[0], 'OpenAPI server') : {};
  const baseUrl = typeof firstServer.url === 'string' ? firstServer.url.replace(/\/+$/, '') : defaultBaseUrl;

  const postmanGroups = new Map<string, JsonRecord[]>();
  const insomniaGroups = new Map<string, string[]>();
  const insomniaRequests = new Map<string, JsonRecord>();
  const environmentValues: Record<string, string> = {
    baseUrl,
    apiKey: '',
    merchantId: '',
  };
  const operations = Object.entries(paths)
    .sort(([left], [right]) => left.localeCompare(right))
    .flatMap(([route, rawPathItem]) => {
      const pathItem = asRecord(rawPathItem, `path "${route}"`);
      return Object.entries(pathItem)
        .filter(([method]) => methods.has(method.toLowerCase()))
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([method, rawOperation]) => ({
          route,
          method: method.toUpperCase(),
          pathItem,
          operation: asRecord(rawOperation, `${method.toUpperCase()} ${route}`),
        }));
    });

  for (const [operationIndex, { route, method, pathItem, operation }] of operations.entries()) {
    const parameters = mergeParameters(spec, pathItem.parameters, operation.parameters);
    const id = operationId(operation, method, route);
    const tags = operationTags(operation);
    const description = typeof operation.description === 'string'
      ? operation.description
      : typeof operation.summary === 'string' ? operation.summary : '';
    const security = authParameters(spec, operation);
    const content = requestBody(spec, operation);
    const securityHeaders = security.filter((parameter) => parameter.location === 'header');
    const securityQuery = security.filter((parameter) => parameter.location === 'query');
    const headers = [
      ...securityHeaders.map(({ key, value }) => ({ key, value })),
      ...(content && content.mode !== 'formdata' ? [{ key: 'Content-Type', value: content.mimeType }] : []),
      ...parameters
        .filter((parameter) => parameter.in === 'header'
          && !securityHeaders.some((secured) =>
            secured.key.toLowerCase() === String(parameter.name).toLowerCase(),
          ))
        .map((parameter) => ({
          key: String(parameter.name),
          value: parameter.name === 'merchantId' ? '{{merchantId}}' : parameterExample(spec, parameter),
          ...(parameter.required === true ? {} : { disabled: true }),
        })),
    ];
    const query = [
      ...securityQuery.map(({ key, value }) => ({ key, value })),
      ...parameters
        .filter((parameter) => parameter.in === 'query'
          && !securityQuery.some((secured) => secured.key === parameter.name))
        .map((parameter) => ({
          key: String(parameter.name),
          value: parameter.name === 'merchantId' ? '{{merchantId}}' : parameterExample(spec, parameter),
          ...(parameter.required === true ? {} : { disabled: true }),
        })),
    ];
    const postmanRequestUrl = postmanUrl(route, parameters);
    if (query.length > 0) postmanRequestUrl.query = query;
    const postmanRequest: JsonRecord = {
      method,
      header: headers.map(({ key, value, ...rest }) => ({ key, value, ...rest })),
      ...(content?.mode === 'raw'
        ? { body: { mode: 'raw', raw: content.text, options: { raw: { language: 'json' } } } }
        : content
          ? {
            body: {
              mode: content.mode,
              [content.mode === 'formdata' ? 'formdata' : 'urlencoded']: content.fields?.map((field) => ({
                key: field.key,
                value: field.value,
                type: field.type,
                ...(field.type === 'file' ? { src: '' } : {}),
              })),
            },
          }
          : {}),
      url: postmanRequestUrl,
      ...(description ? { description } : {}),
    };
    const postmanItem = {
      name: typeof operation.summary === 'string' ? operation.summary : id,
      request: postmanRequest,
    };
    const insomniaHeaders = headers.map(({ key, value, ...options }) => ({
      name: key,
      value: value.replace(/\{\{([^}]+)\}\}/g, '{{ _.$1 }}'),
      ...options,
    }));
    const pathParameterNames = [...route.matchAll(/\{([^}]+)\}/g)].map((match) => match[1]);
    for (const name of pathParameterNames) {
      if (!(name in environmentValues)) environmentValues[name] = '';
    }

    const requestId = `req_${operationIndex}_${safeName(route)}_${method.toLowerCase()}`;
    const insomniaRequest = {
      _id: requestId,
      _type: 'request',
      parentId: '',
      name: typeof operation.summary === 'string' ? operation.summary : id,
      description,
      method,
      url: insomniaUrl(route),
      headers: insomniaHeaders,
      parameters: parameters
        .filter((parameter) => parameter.in === 'query')
        .map((parameter) => ({
          name: String(parameter.name),
          value: parameter.name === 'merchantId'
            ? '{{ _.merchantId }}'
            : parameterExample(spec, parameter),
          disabled: parameter.required !== true,
        }))
        .concat(securityQuery.map(({ key, value }) => ({
          name: key,
          value: value.replace(/\{\{([^}]+)\}\}/g, '{{ _.$1 }}'),
          disabled: false,
        }))),
      ...(content
        ? {
          body: content.mode === 'raw'
            ? { mimeType: content.mimeType, text: content.text }
            : {
              mimeType: content.mimeType,
              params: content.fields?.map((field) => ({
                name: field.key,
                value: field.value,
                type: field.type,
                ...(field.type === 'file' ? { fileName: '' } : {}),
              })),
            },
        }
        : {}),
    };

    const tag = tags[0];
    if (!postmanGroups.has(tag)) postmanGroups.set(tag, []);
    postmanGroups.get(tag)?.push(postmanItem);
    if (!insomniaGroups.has(tag)) insomniaGroups.set(tag, []);
    insomniaGroups.get(tag)?.push(requestId);
    insomniaRequests.set(requestId, insomniaRequest);
  }

  const postmanCollection = {
    info: {
      _postman_id: 'fluxapay-openapi-generated',
      name: typeof info.title === 'string' ? info.title : 'FluxaPay API',
      description: 'Generated from the FluxaPay OpenAPI specification. Set baseUrl and apiKey before sending authenticated requests.',
      schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
    },
    variable: Object.entries({ baseUrl, apiKey: '', merchantId: '' }).map(([key, value]) => ({
      key,
      value,
      type: 'string',
    })),
    item: [...postmanGroups.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([name, items]) => ({
      name,
      item: items,
    })),
  };

  const workspaceId = 'wrk_fluxapay_api';
  const baseEnvironmentId = 'env_fluxapay_base';
  const insomniaResources: JsonRecord[] = [
    {
      _id: workspaceId,
      _type: 'workspace',
      name: typeof info.title === 'string' ? info.title : 'FluxaPay API',
      description: 'Generated from the FluxaPay OpenAPI specification.',
      scope: 'collection',
    },
    {
      _id: baseEnvironmentId,
      _type: 'environment',
      parentId: workspaceId,
      name: 'Base Environment',
      data: environmentValues,
      dataPropertyOrder: { '&': Object.keys(environmentValues) },
      color: null,
      isPrivate: false,
      metaSortKey: 0,
    },
    ...[...insomniaGroups.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .flatMap(([name, requestIds], groupIndex) => {
        const groupId = `fld_${groupIndex}_${safeName(name)}`;
        return [
          {
            _id: groupId,
            _type: 'request_group',
            parentId: workspaceId,
            name,
            description: '',
            environment: {},
            environmentPropertyOrder: null,
            metaSortKey: -groupIndex,
          },
          ...requestIds.map((requestId) => ({
            ...insomniaRequests.get(requestId),
            parentId: groupId,
          })),
        ];
      }),
  ];
  const insomniaExport = {
    _type: 'export',
    __export_format: 4,
    __export_source: 'fluxapay-openapi-generator',
    resources: insomniaResources,
  };
  const postmanEnvironment = {
    id: 'env_fluxapay_local',
    name: 'FluxaPay - Local',
    values: [
      { key: 'baseUrl', value: baseUrl, enabled: true, type: 'default' },
      { key: 'apiKey', value: '', enabled: true, type: 'secret' },
      { key: 'merchantId', value: '', enabled: true, type: 'default' },
    ],
    _postman_variable_scope: 'environment',
    _postman_exported_using: 'FluxaPay OpenAPI generator',
  };

  validatePostmanCollection(postmanCollection);
  validatePostmanEnvironment(postmanEnvironment);
  validateInsomniaExport(insomniaExport);

  return [
    { name: 'fluxapay.postman_collection.json', content: JSON.stringify(postmanCollection, null, 2) + '\n' },
    { name: 'fluxapay.postman_environment.json', content: JSON.stringify(postmanEnvironment, null, 2) + '\n' },
    { name: 'fluxapay.insomnia.json', content: JSON.stringify(insomniaExport, null, 2) + '\n' },
  ];
}

function validatePostmanCollection(collection: JsonRecord): void {
  const info = asRecord(collection.info, 'Postman collection info');
  if (info.schema !== 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json') {
    throw new Error('Generated Postman collection does not declare the v2.1 schema.');
  }
  const variables = asArray(collection.variable, 'Postman collection variables');
  const keys = variables.map((variable) => asRecord(variable, 'Postman variable').key);
  for (const required of ['baseUrl', 'apiKey', 'merchantId']) {
    if (!keys.includes(required)) throw new Error(`Generated Postman collection is missing ${required}.`);
  }
  const itemCount = validatePostmanItems(asArray(collection.item, 'Postman collection items'), 'collection');
  if (itemCount === 0) {
    throw new Error('Generated Postman collection contains no endpoint groups.');
  }
}

function validatePostmanItems(items: unknown[], context: string): number {
  let requestCount = 0;
  for (const itemValue of items) {
    const item = asRecord(itemValue, `Postman ${context} item`);
    if (Array.isArray(item.item)) {
      if (typeof item.name !== 'string' || item.name.length === 0) {
        throw new Error(`Generated Postman ${context} group has no name.`);
      }
      requestCount += validatePostmanItems(item.item, `${context} group "${item.name}"`);
      continue;
    }

    const request = asRecord(item.request, `Postman request "${String(item.name)}"`);
    if (typeof request.method !== 'string') {
      throw new Error(`Generated Postman request "${String(item.name)}" has no method.`);
    }
    const url = asRecord(request.url, `Postman request "${String(item.name)}" URL`);
    if (typeof url.raw !== 'string' || !url.raw.startsWith('{{baseUrl}}/')) {
      throw new Error(`Generated Postman request "${String(item.name)}" has an invalid URL.`);
    }
    asArray(request.header, `Postman request "${String(item.name)}" headers`);
    requestCount += 1;
  }
  return requestCount;
}

function validatePostmanEnvironment(environment: JsonRecord): void {
  const values = asArray(environment.values, 'Postman environment values');
  const keys = values.map((value) => asRecord(value, 'Postman environment variable').key);
  for (const required of ['baseUrl', 'apiKey', 'merchantId']) {
    if (!keys.includes(required)) {
      throw new Error(`Generated Postman environment is missing ${required}.`);
    }
  }
}

function validateInsomniaExport(exportFile: JsonRecord): void {
  if (exportFile._type !== 'export' || exportFile.__export_format !== 4) {
    throw new Error('Generated Insomnia export does not use export format v4.');
  }
  const resources = asArray(exportFile.resources, 'Insomnia resources').map((resource) =>
    asRecord(resource, 'Insomnia resource'),
  );
  const resourceTypes = new Set(resources.map((resource) => resource._type));
  for (const requiredType of ['workspace', 'environment', 'request_group', 'request']) {
    if (!resourceTypes.has(requiredType)) {
      throw new Error(`Generated Insomnia export is missing ${requiredType} resources.`);
    }
  }
  const environment = resources.find((resource) => resource._type === 'environment');
  const data = asRecord(environment?.data, 'Insomnia base environment data');
  for (const required of ['baseUrl', 'apiKey', 'merchantId']) {
    if (!(required in data)) throw new Error(`Generated Insomnia environment is missing ${required}.`);
  }

  const ids = resources.map((resource) => resource._id);
  if (ids.some((id) => typeof id !== 'string') || new Set(ids).size !== ids.length) {
    throw new Error('Generated Insomnia resources must have unique string IDs.');
  }
  const groups = new Set(
    resources.filter((resource) => resource._type === 'request_group').map((resource) => resource._id),
  );
  const requestResources = resources.filter((resource) => resource._type === 'request');
  if (requestResources.length === 0) throw new Error('Generated Insomnia export contains no requests.');
  for (const request of requestResources) {
    if (typeof request.method !== 'string' || typeof request.url !== 'string') {
      throw new Error(`Generated Insomnia request "${String(request._id)}" is missing its method or URL.`);
    }
    if (typeof request.parentId !== 'string' || !groups.has(request.parentId)) {
      throw new Error(`Generated Insomnia request "${String(request._id)}" has no request group.`);
    }
  }
}

function main(): void {
  const checkOnly = process.argv.includes('--check');
  const files = buildArtifacts();
  const staleFiles: string[] = [];

  if (!checkOnly) {
    fs.mkdirSync(outputDirectory, { recursive: true });
  }

  for (const file of files) {
    const outputPath = path.join(outputDirectory, file.name);
    if (checkOnly) {
      if (!fs.existsSync(outputPath) || fs.readFileSync(outputPath, 'utf8') !== file.content) {
        staleFiles.push(file.name);
      }
    } else {
      fs.writeFileSync(outputPath, file.content, 'utf8');
      console.log(`Generated ${outputPath}`);
    }
  }

  if (checkOnly && staleFiles.length > 0) {
    throw new Error(`API collection exports are missing or stale: ${staleFiles.join(', ')}. Run npm run generate:api-collections.`);
  }
  if (checkOnly) {
    console.log('API collection exports are synchronized with the OpenAPI specification.');
  }
}

main();
