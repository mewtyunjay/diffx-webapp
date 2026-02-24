export type SidebarTabId = "files" | "code-review";

export type SidebarTabDefinition = {
  id: SidebarTabId;
  label: string;
};

export const tabRegistry: SidebarTabDefinition[] = [
  { id: "files", label: "Files" },
  { id: "code-review", label: "Code Review" },
];
