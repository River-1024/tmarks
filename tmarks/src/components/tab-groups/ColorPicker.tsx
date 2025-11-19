import { Check } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { COLORS } from './colorUtils'

interface ColorPickerProps {
  currentColor: string | null
  onColorChange: (color: string | null) => void
  onClose: () => void
}

export function ColorPicker({ currentColor, onColorChange, onClose }: ColorPickerProps) {
  const pickerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(event.target as Node)) {
        onClose()
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [onClose])

  return (
    <div
      ref={pickerRef}
      className="absolute top-full right-0 mt-2 rounded-lg shadow-lg border p-5 z-50 min-w-[280px]"
      style={{ backgroundColor: 'var(--card)', borderColor: 'var(--border)' }}
    >
      <h4 className="text-sm font-medium text-foreground mb-3">选择颜色</h4>
      <div className="grid grid-cols-4 gap-4">
        {COLORS.map((color) => (
          <div key={color.value || 'none'} className="flex flex-col items-center gap-1">
            <button
              onClick={() => {
                onColorChange(color.value)
                onClose()
              }}
              className={`w-12 h-12 rounded border-2 ${color.bg} ${color.border} hover:scale-110 hover:shadow-md transition-all relative flex items-center justify-center`}
              title={color.name}
            >
              {currentColor === color.value && (
                <Check className="w-5 h-5 text-foreground" />
              )}
            </button>
            <span className="text-xs text-muted-foreground">{color.name}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
