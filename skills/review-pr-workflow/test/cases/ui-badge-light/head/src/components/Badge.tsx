import React from 'react'

type Variant = 'default' | 'success' | 'error'

export function Badge({ label, variant = 'default' }: { label: string; variant?: Variant }) {
  return <span className={'badge' + variant}>{label}</span>
}
