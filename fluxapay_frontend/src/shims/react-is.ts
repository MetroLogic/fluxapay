import * as React from "react";

export function isFragment(node: unknown): boolean {
  return React.isValidElement(node) && node.type === React.Fragment;
}
