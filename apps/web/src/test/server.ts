import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { apiUrl, envelope } from "./apiUrl";

/**
 * Default handlers: endpoints every device page asks for as a side effect
 * (room labels, readiness). Tests override them with server.use(...).
 */
export const defaultHandlers = [
  http.get(apiUrl("/room-channels"), () => HttpResponse.json(envelope([]))),
];

export const server = setupServer(...defaultHandlers);
