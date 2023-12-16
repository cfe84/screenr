import { Folder } from "./Folder";

export interface IFolderConfiguration {
  folder: Folder
  // For folders without a screening folder, screening folder just happens
  // to be = folder
  screeningFolder: Folder
  scanForSpam?: boolean
  useForTraining?: boolean
}