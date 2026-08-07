// Se carga automáticamente antes de cada archivo de test (ver vitest.config.ts).
// Agrega los matchers de jest-dom (toBeInTheDocument, toBeDisabled, etc.) a expect().
import '@testing-library/jest-dom/vitest'
import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

// Sin esto, el DOM se acumula entre tests del mismo archivo (RTL no limpia solo
// porque no usamos `test.globals: true`) y las queries por rol/texto empiezan a
// devolver "multiple elements found" a partir del segundo test.
afterEach(() => {
  cleanup()
})
