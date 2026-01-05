declare module "file-folder-dialogs" {
  export function OpenFolderDialog(): Promise<string | null>;
  export function OpenFileDialog(filters?: { name: string; extensions: string[] }[]): Promise<string | null>;
  export function SaveFileDialog(defaultName?: string, filters?: { name: string; extensions: string[] }[]): Promise<string | null>;
}
