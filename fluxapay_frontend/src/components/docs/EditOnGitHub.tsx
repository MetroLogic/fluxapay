"use client";

import { Github } from "lucide-react";

interface EditOnGitHubProps {
  filePath: string;
  branch?: string;
}

export function EditOnGitHub({ filePath, branch = "main" }: EditOnGitHubProps) {
  const repoUrl = "https://github.com/MetroLogic/fluxapay";
  const editUrl = `${repoUrl}/edit/${branch}/${filePath}`;

  return (
    <a
      href={editUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-700 transition-colors"
    >
      <Github className="h-4 w-4" />
      Edit on GitHub
    </a>
  );
}
