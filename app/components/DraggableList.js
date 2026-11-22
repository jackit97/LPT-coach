import React, { useMemo, useRef, useState } from 'react';
import { View, PanResponder, Platform } from 'react-native';

// Lista riordinabile trascinando la maniglia (≡) su o giu'. Funziona su web, Android e iOS senza librerie esterne.
// renderItem({ item, index, handleProps, moveUp, moveDown, dragging }) -> l'elemento; handleProps va messo sulla maniglia.
// onReorder(from, to) viene chiamato al rilascio.
export default function DraggableList({ data, keyExtractor, renderItem, onReorder, gap = 0 }) {
  const heights = useRef({});
  const [drag, setDrag] = useState(null); // { index, dy }
  const dragRef = useRef(null);
  // i responder restano gli stessi durante il trascinamento: callback e dati letti dai ref
  const onReorderRef = useRef(onReorder);
  onReorderRef.current = onReorder;
  const countRef = useRef(data.length);
  countRef.current = data.length;

  const targetIndex = (from, dy) => {
    const h = (i) => (heights.current[i] || 60) + gap;
    let target = from;
    if (dy > 0) {
      let acc = 0;
      for (let i = from + 1; i < countRef.current; i += 1) {
        acc += h(i);
        if (dy > acc - h(i) / 2) target = i; else break;
      }
    } else if (dy < 0) {
      let acc = 0;
      for (let i = from - 1; i >= 0; i -= 1) {
        acc += h(i);
        if (-dy > acc - h(i) / 2) target = i; else break;
      }
    }
    return target;
  };

  const responders = useMemo(() => data.map((_, index) => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onStartShouldSetPanResponderCapture: () => true,
    onMoveShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponderCapture: () => true,
    onPanResponderTerminationRequest: () => false,
    onShouldBlockNativeResponder: () => true,
    onPanResponderGrant: () => {
      dragRef.current = { index, dy: 0 };
      setDrag({ index, dy: 0 });
      if (Platform.OS === 'web' && typeof document !== 'undefined') document.body.style.userSelect = 'none';
    },
    onPanResponderMove: (_event, gesture) => {
      dragRef.current = { index, dy: gesture.dy };
      setDrag({ index, dy: gesture.dy });
    },
    onPanResponderRelease: (_event, gesture) => {
      const to = targetIndex(index, gesture.dy);
      dragRef.current = null;
      setDrag(null);
      if (Platform.OS === 'web' && typeof document !== 'undefined') document.body.style.userSelect = '';
      if (to !== index) onReorderRef.current(index, to);
    },
    onPanResponderTerminate: () => {
      dragRef.current = null;
      setDrag(null);
      if (Platform.OS === 'web' && typeof document !== 'undefined') document.body.style.userSelect = '';
    },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  })), [data.length]);

  const target = drag ? targetIndex(drag.index, drag.dy) : null;
  const draggedHeight = drag ? (heights.current[drag.index] || 60) + gap : 0;

  return (
    <View>
      {data.map((item, index) => {
        let translateY = 0;
        if (drag) {
          if (index === drag.index) translateY = drag.dy;
          else if (drag.index < index && index <= target) translateY = -draggedHeight;
          else if (target <= index && index < drag.index) translateY = draggedHeight;
        }
        const dragging = drag?.index === index;
        return (
          <View
            key={keyExtractor(item, index)}
            onLayout={(event) => { heights.current[index] = event.nativeEvent.layout.height; }}
            style={[
              { marginBottom: gap, transform: [{ translateY }] },
              dragging && { zIndex: 10, elevation: 6, opacity: 0.95, shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 8, shadowOffset: { width: 0, height: 4 } },
            ]}
          >
            {renderItem({
              item,
              index,
              dragging,
              handleProps: { ...responders[index]?.panHandlers, style: Platform.OS === 'web' ? { cursor: 'grab', touchAction: 'none' } : undefined },
              moveUp: index > 0 ? () => onReorder(index, index - 1) : null,
              moveDown: index < data.length - 1 ? () => onReorder(index, index + 1) : null,
            })}
          </View>
        );
      })}
    </View>
  );
}

// Sposta un elemento di un array da "from" a "to"
export function moveItem(list, from, to) {
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}
