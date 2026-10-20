# API Reference Collections

Download the generated API collections to explore FluxaPay endpoints in your API client:

- [Postman collection](../../fluxapay_frontend/public/api-collections/fluxapay.postman_collection.json)
- [Postman local environment](../../fluxapay_frontend/public/api-collections/fluxapay.postman_environment.json)
- [Insomnia v4 export](../../fluxapay_frontend/public/api-collections/fluxapay.insomnia.json)

[![Run in Postman](https://run.pstmn.io/button.svg)](../../fluxapay_frontend/public/api-collections/fluxapay.postman_collection.json)

The Postman collection and local environment can be imported separately. The Insomnia export includes its workspace, requests, and base environment. The badge opens the generated Postman collection for import. To enable Postman's one-click fork flow, publish the collection in a public Postman workspace and replace the badge link with its collection URL.

## Configure credentials

The collections include these variables:

| Variable | Default | Description |
| --- | --- | --- |
| `baseUrl` | `http://localhost:3000` | FluxaPay API server URL |
| `apiKey` | Empty | API key or access credential used by the selected endpoint's OpenAPI security scheme |
| `merchantId` | Empty | Merchant identifier for endpoints that require it as a path parameter |

For Postman, import both JSON files and select **FluxaPay - Local** as the active environment. For Insomnia, import the v4 export and edit **Base Environment**. Set `baseUrl` to `https://api.fluxapay.com` to use production.

Postman references variables as `{{baseUrl}}`, `{{apiKey}}`, and `{{merchantId}}`. Insomnia uses its equivalent template syntax: `{{ _.baseUrl }}`, `{{ _.apiKey }}`, and `{{ _.merchantId }}`.

The generator maps each endpoint's OpenAPI security scheme to its corresponding request header. Public endpoints remain unauthenticated.

## Regenerate and verify

From the repository root, run:

```sh
cd fluxapay_backend
npm run generate:api-collections
npm run check:api-collections
```

The check command is part of backend CI and fails if either exported collection is missing or differs from the current OpenAPI specification.
