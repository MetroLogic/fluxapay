/**
 * fileScan.util.ts
 *
 * Provides unified file scanning/virus detection through a configurable AV provider.
 * Supports ClamAV (via TCP socket), cloud-based scanning (e.g., VirusTotal), and mock mode.
 *
 * Environment Configuration:
 *   AV_PROVIDER           – "clamav" | "virustotal" | "mock" (default: "mock")
 *   CLAMAV_HOST           – TCP host (default: "127.0.0.1" for ClamAV)
 *   CLAMAV_PORT           – TCP port (default: 3310)
 *   VIRUSTOTAL_API_KEY    – API key for VirusTotal cloud scanning
 *   AV_SCAN_TIMEOUT_MS    – Request timeout (default: 30000)
 *
 * Returns:
 *   { clean: true }                                    – File passed scan
 *   { clean: false, reason: "virus_detected", ... }   – Malware detected
 *   { clean: false, reason: "scan_error", error: ... } – Scan infrastructure failure
 */

import axios from "axios";
import { ErrorCode } from "../types/errors";
import { apiError } from "../helpers/apiError.helper";

export interface FileScanResult {
  clean: boolean;
  reason?: "virus_detected" | "scan_error" | "timeout" | "unsupported_provider";
  virusName?: string;
  engine?: string; // Which scanner engine detected threat
  error?: string; // Technical error details (not exposed to user)
}

/**
 * Scan a file buffer for malware/viruses
 * @param buffer File contents
 * @param filename Optional filename for logging
 * @returns FileScanResult
 */
export async function scanFile(
  buffer: Buffer,
  filename?: string
): Promise<FileScanResult> {
  const provider = (process.env.AV_PROVIDER || "mock").toLowerCase();
  const timeout = parseInt(process.env.AV_SCAN_TIMEOUT_MS || "30000", 10);

  try {
    switch (provider) {
      case "clamav":
        return await scanWithClamAV(buffer, filename, timeout);
      case "virustotal":
        return await scanWithVirusTotal(buffer, filename, timeout);
      case "mock":
        return scanWithMock(buffer, filename);
      default:
        return {
          clean: false,
          reason: "unsupported_provider",
          error: `Unknown AV_PROVIDER: ${provider}`,
        };
    }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error(`[FileScan] Scan error with ${provider}: ${errorMsg}`, {
      filename,
      provider,
    });

    return {
      clean: false,
      reason: "scan_error",
      error: errorMsg,
    };
  }
}

/**
 * Scan with ClamAV via TCP socket
 * Requires ClamAV daemon running (clamd service)
 */
async function scanWithClamAV(
  buffer: Buffer,
  filename: string | undefined,
  timeout: number
): Promise<FileScanResult> {
  try {
    const host = process.env.CLAMAV_HOST || "127.0.0.1";
    const port = parseInt(process.env.CLAMAV_PORT || "3310", 10);

    // For production, you'd typically use a library like node-clamav or clamav-client
    // This is a simplified example using direct socket communication
    const { Net } = await import("net");

    return new Promise((resolve, reject) => {
      const socket = new Net.Socket();
      let response = "";

      const timeoutHandle = setTimeout(() => {
        socket.destroy();
        reject(new Error("ClamAV scan timeout"));
      }, timeout);

      socket.connect(port, host, () => {
        // Send INSTREAM command for scanning
        socket.write(`INSTREAM\r\n`);
        socket.write(`${buffer.length.toString(16)}\r\n`);
        socket.write(buffer);
        socket.write(`\r\n0\r\n`);
      });

      socket.on("data", (chunk) => {
        response += chunk.toString();
      });

      socket.on("end", () => {
        clearTimeout(timeoutHandle);
        socket.destroy();

        // Parse ClamAV response
        // Format: "filename: OK" or "filename: VIRUS_NAME FOUND"
        if (response.includes("FOUND")) {
          const match = response.match(/:\s*(.+?)\s+FOUND/);
          const virusName = match ? match[1] : "Unknown";
          resolve({
            clean: false,
            reason: "virus_detected",
            virusName,
            engine: "ClamAV",
          });
        } else if (response.includes("OK")) {
          resolve({ clean: true });
        } else {
          reject(new Error(`Unexpected ClamAV response: ${response}`));
        }
      });

      socket.on("error", (err) => {
        clearTimeout(timeoutHandle);
        reject(err);
      });
    });
  } catch (err) {
    throw new Error(
      `ClamAV scan failed: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

/**
 * Scan with VirusTotal cloud API
 * Requires VIRUSTOTAL_API_KEY environment variable
 */
async function scanWithVirusTotal(
  buffer: Buffer,
  filename: string | undefined,
  timeout: number
): Promise<FileScanResult> {
  const apiKey = process.env.VIRUSTOTAL_API_KEY;
  if (!apiKey) {
    throw new Error(
      "VIRUSTOTAL_API_KEY not configured but AV_PROVIDER=virustotal"
    );
  }

  try {
    const FormData = (await import("form-data")).default;
    const fs = await import("fs");

    const form = new FormData();
    form.append("file", buffer, { filename: filename || "unknown" });

    const response = await axios.post(
      "https://www.virustotal.com/api/v3/files",
      form,
      {
        headers: {
          ...form.getHeaders(),
          "x-apikey": apiKey,
        },
        timeout,
        maxContentLength: 10 * 1024 * 1024, // 10MB limit
      }
    );

    // VirusTotal returns file analysis data; 0 detections = clean
    const fileId = response.data?.data?.id;
    if (!fileId) {
      throw new Error("No file ID returned from VirusTotal");
    }

    // Poll analysis results
    const analysisResponse = await axios.get(
      `https://www.virustotal.com/api/v3/files/${fileId}`,
      {
        headers: { "x-apikey": apiKey },
        timeout,
      }
    );

    const stats = analysisResponse.data?.data?.attributes?.stats;
    const detections = stats?.malicious || 0;
    const suspicious = stats?.suspicious || 0;
    const undetected = stats?.undetected || 0;

    if (detections > 0 || suspicious > 0) {
      return {
        clean: false,
        reason: "virus_detected",
        virusName: `${detections} engine(s) flagged as malicious, ${suspicious} suspicious`,
        engine: "VirusTotal",
      };
    }

    return { clean: true };
  } catch (err) {
    throw new Error(
      `VirusTotal scan failed: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

/**
 * Mock scan for development/testing
 * Detects test strings to allow controlled testing of clean/infected scenarios
 */
function scanWithMock(
  buffer: Buffer,
  filename: string | undefined
): FileScanResult {
  // Allow test files to trigger specific behaviors
  const content = buffer.toString("utf-8", 0, Math.min(100, buffer.length));

  if (
    content.includes("EICAR") ||
    content.includes("malware_test") ||
    filename?.includes("virus")
  ) {
    return {
      clean: false,
      reason: "virus_detected",
      virusName: "Test.Malware.Detected",
      engine: "MockScanner",
    };
  }

  return { clean: true };
}

/**
 * Convert scan result to HTTP error response for API
 * @param result FileScanResult from scanFile()
 * @param filename Optional filename for user-facing message
 */
export function handleScanFailure(
  result: FileScanResult,
  filename?: string
): never {
  if (result.reason === "virus_detected") {
    throw apiError(
      422,
      ErrorCode.MALICIOUS_FILE_DETECTED,
      `File "${filename || "upload"}" was flagged as potentially malicious and has been rejected. ` +
        `If you believe this is an error, please contact support.`
    );
  }

  if (result.reason === "scan_error") {
    // Scan infrastructure failure – don't reject file yet, but alert ops
    console.error(`[FileScan] Scan infrastructure error: ${result.error}`, {
      filename,
    });

    // In production, consider whether to:
    // A) Reject the upload (fail-secure, disrupt users)
    // B) Allow with a flag for manual review (fail-open, security risk)
    // For now, we fail-secure:
    throw apiError(
      503,
      ErrorCode.SCAN_SERVICE_UNAVAILABLE,
      "File scanning service is temporarily unavailable. Please try again later."
    );
  }

  if (result.reason === "timeout") {
    throw apiError(
      504,
      ErrorCode.SCAN_TIMEOUT,
      "File scan took too long. Please try again with a smaller file."
    );
  }

  if (result.reason === "unsupported_provider") {
    // Configuration error – should not reach users
    throw apiError(
      500,
      ErrorCode.INTERNAL_ERROR,
      "File scanning is not properly configured."
    );
  }

  // Unknown reason
  throw apiError(
    500,
    ErrorCode.INTERNAL_ERROR,
    "File scan encountered an unknown error."
  );
}
