import { useEffect, useRef } from 'react';
import { FixedSizeList, type ListChildComponentProps } from 'react-window';
import { MessageItem } from './MessageItem';
import type { ButtonBlock, Member, Message } from './types';

interface Props {
  messages: Message[];
  authorById: Map<string, Member>;
  height: number;
  resolvedIds: Set<string>;
  onAction?: (msg: Message, block: ButtonBlock) => void;
}

// Alto fijo. Subido a 140 para acomodar 1 toolCall + 1 fila de botones.
// Pendiente: pasar a VariableSizeList con medicion dinamica.
const ROW_HEIGHT = 140;

export function MessageList({ messages, authorById, height, resolvedIds, onAction }: Props) {
  const listRef = useRef<FixedSizeList>(null);

  useEffect(() => {
    if (messages.length > 0) listRef.current?.scrollToItem(messages.length - 1, 'end');
  }, [messages.length]);

  if (messages.length === 0) {
    return (
      <div className="empty-state">
        Sin mensajes todavía. Escribí algo o mencioná a @agente-facturacion.
      </div>
    );
  }

  return (
    <FixedSizeList
      ref={listRef}
      height={height}
      width="100%"
      itemCount={messages.length}
      itemSize={ROW_HEIGHT}
      overscanCount={5}
    >
      {({ index, style }: ListChildComponentProps) => {
        const m = messages[index];
        return (
          <MessageItem
            msg={m}
            authorById={authorById}
            style={style}
            resolved={resolvedIds.has(m.id)}
            onAction={onAction}
          />
        );
      }}
    </FixedSizeList>
  );
}
