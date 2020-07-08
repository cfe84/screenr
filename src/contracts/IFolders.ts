import { FolderAlias } from "./Folder";
import { IDictionary } from "./IDictionary";
import { IFolderConfiguration } from "./IFolderConfiguration";


export interface IFolders {
  aliases: FolderAlias[],
  folders: IDictionary<IFolderConfiguration>
}