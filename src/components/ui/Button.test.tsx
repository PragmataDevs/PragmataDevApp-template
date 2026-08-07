/** @vitest-environment jsdom */
// Smoke test del setup de render (jsdom + testing-library) — no es cobertura
// exhaustiva del Button, es la prueba de que el setup jala. Úsalo de plantilla
// para tests de componentes reales donde el riesgo lo justifique.
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Button } from './Button'

describe('Button', () => {
  it('renderiza el texto y responde al click', () => {
    const onClick = vi.fn()
    render(<Button onClick={onClick}>Guardar</Button>)

    const btn = screen.getByRole('button', { name: 'Guardar' })
    fireEvent.click(btn)

    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('se deshabilita y no dispara onClick mientras loading', () => {
    const onClick = vi.fn()
    render(
      <Button onClick={onClick} loading>
        Guardar
      </Button>,
    )

    const btn = screen.getByRole('button', { name: 'Guardar' })
    expect(btn).toBeDisabled()

    fireEvent.click(btn)
    expect(onClick).not.toHaveBeenCalled()
  })
})
