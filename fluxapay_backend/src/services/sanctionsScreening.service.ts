import { prisma } from "../config/prisma";

export type SanctionsScreeningStatus = "CLEAR" | "SANCTIONS_REVIEW_REQUIRED" | "FALSE_POSITIVE";

export interface SanctionsScreeningInput {
  companyName: string;
  directorNames: string[];
  country?: string;
}

export interface SanctionsMatch {
  list: "OFAC" | "PEP";
  name: string;
  reason: string;
}

export interface SanctionsResult {
  matched: boolean;
  matches: SanctionsMatch[];
}

export interface ISanctionsProvider {
  readonly name: string;
  screen(input: SanctionsScreeningInput): Promise<SanctionsResult>;
}

/**
 * Mock provider for tests/staging. Test keywords in a name simulate hits:
 *  - "ofac" / "sanctioned"  -> OFAC match
 *  - "pep" / "minister"     -> PEP match
 */
export class MockSanctionsProvider implements ISanctionsProvider {
  readonly name = "mock";

  async screen(input: SanctionsScreeningInput): Promise<SanctionsResult> {
    const matches: SanctionsMatch[] = [];
    const names = [input.companyName, ...input.directorNames];
    for (const name of names) {
      const lower = (name || "").toLowerCase();
      if (/\b(ofac|sanctioned)\b/.test(lower)) {
        matches.push({ list: "OFAC", name, reason: "Mock OFAC keyword match" });
      }
      if (/\b(pep|minister)\b/.test(lower)) {
        matches.push({ list: "PEP", name, reason: "Mock PEP keyword match" });
      }
    }
    return { matched: matches.length > 0, matches };
  }
}

let provider: ISanctionsProvider = new MockSanctionsProvider();

export function setSanctionsProvider(p: ISanctionsProvider): void {
  provider = p;
}

export function getSanctionsProvider(): ISanctionsProvider {
  return provider;
}

/** Pure evaluation: run the provider and derive a status. */
export async function evaluateSanctions(
  input: SanctionsScreeningInput,
  p: ISanctionsProvider = provider,
): Promise<{ status: SanctionsScreeningStatus; result: SanctionsResult }> {
  const result = await p.screen(input);
  return { status: result.matched ? "SANCTIONS_REVIEW_REQUIRED" : "CLEAR", result };
}

/**
 * Screen a KYC submission and persist an audit record. Intended to be fired
 * asynchronously after KYC submission; never throws.
 */
export async function screenKycSubmission(params: {
  merchantId: string;
  kycId: string;
  companyName: string;
  directorName: string;
  country?: string;
}): Promise<SanctionsScreeningStatus | null> {
  try {
    const { status, result } = await evaluateSanctions({
      companyName: params.companyName,
      directorNames: [params.directorName],
      country: params.country,
    });
    await prisma.sanctionsScreening.create({
      data: {
        merchantId: params.merchantId,
        kycId: params.kycId,
        provider: provider.name,
        status,
        matches: result.matches as any,
      },
    });
    return status;
  } catch (err) {
    console.error("[SanctionsScreening] screening failed:", err);
    return null;
  }
}

/** True if the merchant's latest screening requires manual sanctions review. */
export async function hasUnresolvedSanctionsHit(merchantId: string): Promise<boolean> {
  const latest = await prisma.sanctionsScreening.findFirst({
    where: { merchantId },
    orderBy: { created_at: "desc" },
    select: { status: true },
  });
  return latest?.status === "SANCTIONS_REVIEW_REQUIRED";
}

/** Admin resolution of a hit as a false positive; unblocks approval. */
export async function resolveSanctionsFalsePositive(merchantId: string, reviewerId: string) {
  const latest = await prisma.sanctionsScreening.findFirst({
    where: { merchantId },
    orderBy: { created_at: "desc" },
  });
  if (!latest) return null;
  return prisma.sanctionsScreening.update({
    where: { id: latest.id },
    data: { status: "FALSE_POSITIVE", resolved_by: reviewerId, resolved_at: new Date() },
  });
}
