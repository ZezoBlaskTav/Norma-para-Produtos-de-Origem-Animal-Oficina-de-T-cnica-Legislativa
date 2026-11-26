import React, { useState } from 'react';
import { GripVertical } from 'lucide-react';
import { Reorder, useDragControls } from 'motion/react';

export const NORMA_LAYOUT_SPRING = {
  type: 'spring' as const,
  stiffness: 420,
  damping: 36,
  mass: 0.8,
};

interface SortableNormaGroupProps {
  values: string[];
  onReorder: (nextValues: string[]) => void;
  className?: string;
  children: React.ReactNode;
}

export const SortableNormaGroup: React.FC<SortableNormaGroupProps> = ({
  values,
  onReorder,
  className = '',
  children,
}) => (
  <Reorder.Group
    axis="y"
    as="div"
    values={values}
    onReorder={onReorder}
    className={className}
  >
    {children}
  </Reorder.Group>
);

export interface SortableDragHandleButtonProps {
  onPointerDown?: (event: React.PointerEvent<HTMLButtonElement>) => void;
  label: string;
  compact?: boolean;
  isDragging?: boolean;
}

export const SortableDragHandleButton: React.FC<
  SortableDragHandleButtonProps
> = ({ onPointerDown, label, compact = false, isDragging = false }) => {
  if (!onPointerDown) return null;
  return (
    <button
      type="button"
      onPointerDown={onPointerDown}
      title={label}
      aria-label={label}
      className={`${
        compact ? 'p-1' : 'p-1.5'
      } rounded border text-slate-400 hover:text-slate-800 hover:bg-slate-100 hover:border-slate-200 cursor-grab active:cursor-grabbing select-none touch-none transition-colors shrink-0 ${
        isDragging
          ? 'text-slate-900 bg-slate-100 border-slate-300'
          : 'border-transparent'
      }`}
    >
      <GripVertical className="w-3.5 h-3.5" />
    </button>
  );
};

interface SortableNormaItemProps {
  value: string;
  canDrag?: boolean;
  className?: string;
  draggingClassName?: string;
  children: (helpers: {
    isDragging: boolean;
    startDrag?: (event: React.PointerEvent<HTMLButtonElement>) => void;
  }) => React.ReactNode;
}

export const SortableNormaItem: React.FC<SortableNormaItemProps> = ({
  value,
  canDrag = true,
  className = '',
  draggingClassName = 'bg-white rounded-md ring-1 ring-slate-300',
  children,
}) => {
  const dragControls = useDragControls();
  const [isDragging, setIsDragging] = useState(false);

  return (
    <Reorder.Item
      as="div"
      value={value}
      dragListener={false}
      dragControls={dragControls}
      layout="position"
      transition={NORMA_LAYOUT_SPRING}
      onDragStart={() => setIsDragging(true)}
      onDragEnd={() => setIsDragging(false)}
      whileDrag={{
        scale: 1.008,
        boxShadow: '0 12px 28px -8px rgba(15, 23, 42, 0.16)',
        zIndex: 30,
      }}
      style={{ position: 'relative' }}
      className={`${className} ${isDragging ? draggingClassName : ''}`.trim()}
    >
      {children({
        isDragging,
        startDrag: canDrag
          ? (event) => {
              dragControls.start(event);
            }
          : undefined,
      })}
    </Reorder.Item>
  );
};
