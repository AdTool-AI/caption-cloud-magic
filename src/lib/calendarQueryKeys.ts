/** Include the actor in private calendar identities, including optimistic updates. */
export const calendarEventsQueryKey = (actorId: string | undefined, workspaceId: string, clientId: string, brandId: string) =>
  ['calendar-events', actorId ?? null, workspaceId, clientId, brandId] as const;
export const calendarClientsQueryKey = (actorId: string | undefined, workspaceId: string) =>
  ['clients', actorId ?? null, workspaceId] as const;
export const calendarMembersQueryKey = (actorId: string | undefined, workspaceId: string) =>
  ['workspace-members', actorId ?? null, workspaceId] as const;
