interface EmptyStateProps {
  colSpan: number;
  message?: string;
  className?: string;
}

export default function EmptyState({
  colSpan,
  message = "No data available.",
  className = "py-8",
}: EmptyStateProps) {
  return (
    <tr>
      <td colSpan={colSpan} className={`text-center text-gray-400 ${className}`}>
        {message}
      </td>
    </tr>
  );
}
