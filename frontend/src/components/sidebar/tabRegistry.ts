export type SidebarTabId = "files" | "actions";

export type SidebarTabDefinition = {
  id: SidebarTabId;
  label: string;
};

export const tabRegistry: SidebarTabDefinition[] = [
  { id: "files", label: "Files" },
  { id: "actions", label: "Actions" },
];
