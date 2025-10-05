import { render, screen } from '@testing-library/react';
import App from './App';

test('renders scouting interface controls', () => {
  render(<App />);
  expect(screen.getByText(/ScoutScape/i)).toBeInTheDocument();
  expect(screen.getByText(/Add location/i)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Find in Vancouver/i })).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: /TomTom traffic/i })).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: /Gemini scouting brief/i })).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: /Conditions at selected time/i })).toBeInTheDocument();
});
