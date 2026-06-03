import { useEffect, useRef } from 'react';
import { FixedSizeList, type ListChildComponentProps } from 'react-window';
import { MessageItem } from './MessageItem';
import type { Member, Message } from './types';

interface Props {
  messages: Message[];
  authorById: Map<string, Member>;
  height: number;
}

// Heuristica: alto fijo razonable. Mensajes con toolCalls grandes pueden
// clippearse; aceptable para MVP. Para v2: VariableSizeList con medicion.
const ROW_HEIGHT = 80;

export function MessageList({ messages, authorById, height }: Props) {
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
      {({ index, style }: ListChildComponentProps) => (
        <MessageItem msg={messages[index]} authorById={authorById} style={style} />
      )}
    </FixedSizeList>
  );
}
