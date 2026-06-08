import type { BacklogItem } from '../types/backlog';

interface BacklogListProps {
  items: BacklogItem[];
}

export function BacklogList({ items }: BacklogListProps) {
  if (items.length === 0) {
    return <p style={{ color: '#9ca3af', fontSize: '0.875rem' }}>No hay elementos en el backlog.</p>;
  }

  return (
    <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
      {items.map((item) => (
        <li key={item.id} style={{ padding: '8px 0', borderBottom: '1px solid #e5e7eb' }}>
          <strong style={{ fontSize: '0.875rem' }}>#{item.task_id.slice(0, 8)}</strong>
          <span style={{ marginLeft: 8, fontSize: '0.75rem', color: '#6b7280' }}>
            {item.priority.toUpperCase()}
          </span>
        </li>
      ))}
    </ul>
  );
}
