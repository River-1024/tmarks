import { ReactNode } from 'react'
import { LucideIcon } from 'lucide-react'

interface InfoBoxProps {
  icon: LucideIcon
  title: string
  children: ReactNode
  variant?: 'info' | 'success' | 'warning'
}

export function InfoBox({ icon: Icon, title, children, variant = 'info' }: InfoBoxProps) {
  const variantStyles = {
    info: {
      container: 'bg-primary/5 border-primary/20',
      icon: 'text-primary',
      title: 'text-foreground',
      content: 'text-muted-foreground'
    },
    success: {
      container: 'bg-success/5 border-success/20',
      icon: 'text-success',
      title: 'text-foreground',
      content: 'text-muted-foreground'
    },
    warning: {
      container: 'bg-warning/5 border-warning/20',
      icon: 'text-warning',
      title: 'text-foreground',
      content: 'text-muted-foreground'
    }
  }

  const styles = variantStyles[variant]

  return (
    <div className={`rounded-lg border p-4 ${styles.container}`}>
      <div className="flex items-start gap-2">
        <Icon className={`w-5 h-5 flex-shrink-0 mt-0.5 ${styles.icon}`} />
        <div>
          <h4 className={`text-sm font-semibold mb-2 ${styles.title}`}>
            {title}
          </h4>
          <div className={`text-xs space-y-1 ${styles.content}`}>
            {children}
          </div>
        </div>
      </div>
    </div>
  )
}
