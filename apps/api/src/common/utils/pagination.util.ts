import type { PaginationDto } from '../dto/pagination.dto';

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export function getPaginationParams(dto: PaginationDto) {
  const page = dto.page ?? 1;
  const pageSize = dto.pageSize ?? 20;
  const skip = (page - 1) * pageSize;
  return { page, pageSize, skip, take: pageSize };
}

export function buildPaginatedResult<T>(
  items: T[],
  total: number,
  page: number,
  pageSize: number,
): PaginatedResult<T> {
  return {
    items,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize) || 1,
  };
}
