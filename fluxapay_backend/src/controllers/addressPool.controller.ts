import { Request, Response } from "express";
import { DepositAddressService } from "../services/depositAddress.service";

export async function getAddressPoolStats(req: Request, res: Response) {
  try {
    const stats = await DepositAddressService.getPoolStats();
    res.status(200).json({ data: stats });
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Failed to retrieve pool stats" });
  }
}
