import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import App from '../App'

vi.mock('../components/ResponsiveNavigation', () => ({
  ResponsiveNavigation: () => <nav data-testid="navigation">Navigation</nav>,
}))

vi.mock('../components/LoadingSpinner', () => ({
  LoadingSpinner: () => <div data-testid="loading-spinner">Loading...</div>,
}))

vi.mock('../components/ErrorBoundary', () => ({
  ErrorBoundary: ({ children }: { children: React.ReactNode }) => <div data-testid="error-boundary">{children}</div>,
}))

vi.mock('react-router-dom', () => ({
  BrowserRouter: ({ children }: { children: React.ReactNode }) => <div data-testid="browser-router">{children}</div>,
  Routes: ({ children }: { children: React.ReactNode }) => <div data-testid="routes">{children}</div>,
  Route: () => <div data-testid="route" />,
}))

describe('App', () => {
  it('renders without crashing', () => {
    const { container } = render(<App />)
    expect(container).toBeDefined()
  })

  it('renders navigation component', () => {
    render(<App />)
    expect(screen.getByTestId('navigation')).toBeDefined()
  })

  it('renders within BrowserRouter', () => {
    render(<App />)
    expect(screen.getByTestId('browser-router')).toBeDefined()
  })

  it('renders within ErrorBoundary', () => {
    render(<App />)
    expect(screen.getByTestId('error-boundary')).toBeDefined()
  })

  it('renders routes container', () => {
    render(<App />)
    expect(screen.getByTestId('routes')).toBeDefined()
  })
})
