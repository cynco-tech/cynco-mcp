/**
 * Cursor-based pagination utilities for MCP tools.
 * Cursor encodes the last seen ID + sort order for stateless pagination.
 */

export function encodeCursor(id: string, sortValue: string): string {
  return Buffer.from(JSON.stringify({ id, sv: sortValue })).toString("base64url");
}

export function decodeCursor(cursor: string): { id: string; sortValue: string } | null {
  try {
    const decoded = JSON.parse(Buffer.from(cursor, "base64url").toString("utf-8"));
    if (typeof decoded.id === "string" && typeof decoded.sv === "string") {
      return { id: decoded.id, sortValue: decoded.sv };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Build pagination result with both offset and cursor support.
 */
export function paginationResult<T extends { id: string }>(
  rows: T[],
  limit: number,
  offset: number,
  sortField: string,
  getSortValue: (item: T) => string,
) {
  const hasMore = rows.length > limit;
  const items = rows.slice(0, limit);
  const lastItem = items[items.length - 1];

  return {
    hasMore,
    nextOffset: hasMore ? offset + limit : null,
    nextCursor: hasMore && lastItem ? encodeCursor(lastItem.id, getSortValue(lastItem)) : null,
  };
}
