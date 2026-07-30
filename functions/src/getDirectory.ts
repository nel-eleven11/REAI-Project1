import type { Request, Response } from "express";
import { queryDirectory } from "./services/directoryRepo";

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;

function parsePositiveInt(raw: unknown, fallback: number): number {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed < 1) {
    return fallback;
  }
  return parsed;
}

export async function getDirectoryHandler(req: Request, res: Response): Promise<void> {
  const page = parsePositiveInt(req.query.page, 1);

  const configuredDefault = parsePositiveInt(process.env.DEFAULT_PAGE_SIZE, DEFAULT_PAGE_SIZE);
  const configuredMax = parsePositiveInt(process.env.MAX_PAGE_SIZE, MAX_PAGE_SIZE);

  const requestedPageSize = parsePositiveInt(req.query.pageSize, configuredDefault);

  const pageSize = Math.min(requestedPageSize, configuredMax);

  const especialidad = typeof req.query.especialidad === "string" ? req.query.especialidad : undefined;
  const zona = typeof req.query.zona === "string" ? req.query.zona : undefined;

  try {
    const result = await queryDirectory({ page, pageSize, especialidad, zona });
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ error: "Failure to check repository", detail: (error as Error).message });
  }
}
