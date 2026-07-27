import { Button } from '../ui/button';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  startIndex: number;
  endIndex: number;
  totalItems: number;
}

export function Pagination({
  currentPage,
  totalPages,
  onPageChange,
  startIndex,
  endIndex,
  totalItems,
}: PaginationProps) {
  const getPageNumbers = () => {
    const pages: (number | string)[] = [];
    const maxPagesToShow = 5;

    if (totalPages <= maxPagesToShow) {
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      if (currentPage <= 3) {
        for (let i = 1; i <= 4; i++) {
          pages.push(i);
        }
        pages.push('...');
        pages.push(totalPages);
      } else if (currentPage >= totalPages - 2) {
        pages.push(1);
        pages.push('...');
        for (let i = totalPages - 3; i <= totalPages; i++) {
          pages.push(i);
        }
      } else {
        pages.push(1);
        pages.push('...');
        for (let i = currentPage - 1; i <= currentPage + 1; i++) {
          pages.push(i);
        }
        pages.push('...');
        pages.push(totalPages);
      }
    }

    return pages;
  };

  if (totalPages <= 1) return null;

  return (
    <div className="flex items-center px-4 py-3 border-t gap-2 min-w-0">
      {/* Compact result count — "1 to 15 / 191". Full "Showing … of …
          results" phrasing was wasting horizontal space that the
          page-number buttons need on narrow screens. shrink-0 pins
          it to the left while the button cluster on the right takes
          the remaining width and slides. */}
      <div className="text-sm text-gray-600 shrink-0 whitespace-nowrap">
        <span className="font-medium">{startIndex}</span>
        <span className="text-gray-500"> to </span>
        <span className="font-medium">{endIndex}</span>
        <span className="text-gray-500"> / </span>
        <span className="font-medium">{totalItems}</span>
      </div>
      {/* v-pagination-slide — same overflow-x-auto + hover-scroll-x
          + shrink-0-child pattern the Items filter strip and Layout
          top bar use. On mobile, the page-number row slides left/right
          instead of clipping or wrapping to a second line. */}
      <div className="flex-1 min-w-0 flex items-center justify-end gap-2 overflow-x-auto hover-scroll-x [&>*]:shrink-0">
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage === 1}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        {getPageNumbers().map((page, index) => (
          <Button
            key={index}
            variant={page === currentPage ? 'default' : 'outline'}
            size="sm"
            onClick={() => typeof page === 'number' && onPageChange(page)}
            disabled={typeof page !== 'number'}
            className={typeof page !== 'number' ? 'cursor-default' : ''}
          >
            {page}
          </Button>
        ))}
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage === totalPages}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
