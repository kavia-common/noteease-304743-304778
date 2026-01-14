import { render, screen } from "@testing-library/react";
import App from "./App";

test("renders app header brand and theme toggle", async () => {
  render(<App />);

  expect(await screen.findByText(/NoteEase/i)).toBeInTheDocument();
  // Theme toggle button should be present (label includes target mode).
  expect(screen.getByRole("button", { name: /switch to dark mode/i })).toBeInTheDocument();
});
