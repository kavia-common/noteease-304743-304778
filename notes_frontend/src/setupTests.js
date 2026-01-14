// jest-dom adds custom jest matchers for asserting on DOM nodes.
// allows you to do things like:
// expect(element).toHaveTextContent(/react/i)
// learn more: https://github.com/testing-library/jest-dom
import "@testing-library/jest-dom";

// Silence React Router "future flag" warnings to keep test output focused.
// (These are not actionable within this exercise; they can be addressed during a router upgrade.)
const originalWarn = console.warn;
beforeAll(() => {
  jest.spyOn(console, "warn").mockImplementation((...args) => {
    const msg = String(args[0] ?? "");
    if (msg.includes("React Router Future Flag Warning")) return;
    originalWarn(...args);
  });
});

afterAll(() => {
  console.warn.mockRestore?.();
});
