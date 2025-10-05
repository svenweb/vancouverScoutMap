import { render, screen } from '@testing-library/react';
import App from './App';

test('renders add location panel', () => {
  render(<App />);
  const heading = screen.getByText(/Add location/i);
  expect(heading).toBeInTheDocument();
});
