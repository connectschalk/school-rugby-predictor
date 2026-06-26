type Props = {
  title: string
  description?: string
  action?: React.ReactNode
  icon?: string
}

export default function MmEmptyState({ title, description, action, icon }: Props) {
  return (
    <div className="mm-card mx-4 flex flex-col items-center rounded-2xl px-6 py-10 text-center">
      {icon ? <span className="mb-3 text-3xl" aria-hidden>{icon}</span> : null}
      <h3 className="text-base font-black">{title}</h3>
      {description ? <p className="mm-muted mt-2 max-w-sm text-sm leading-relaxed">{description}</p> : null}
      {action ? <div className="mt-5 w-full max-w-xs">{action}</div> : null}
    </div>
  )
}
