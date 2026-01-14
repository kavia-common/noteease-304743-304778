import { render, screen } from "@testing-library/react";
import App from "./App";

test("renders app header brand", () => {
  render(<App />);
  expect(screen.getByText(/NoteEase/i)).toBeInTheDocument();
});
