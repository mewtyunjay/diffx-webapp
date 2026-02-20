export type SidebarTabId = "files";

export type SidebarTabDefinition = {
  id: SidebarTabId;
  label: string;
};

export const tabRegistry: SidebarTabDefinition[] = [
  { id: "files", label: "Files" },
];
