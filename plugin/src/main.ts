import { Plugin } from "obsidian";

export default class MetaKBPlugin extends Plugin {
  async onload() {
    console.log("MetaKB plugin loaded");
  }

  onunload() {
    console.log("MetaKB plugin unloaded");
  }
}
