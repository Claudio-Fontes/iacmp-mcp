import * as fs from 'fs';
import * as path from 'path';

export function handleWriteStack(args: { projectPath: string; filePath: string; content: string }): string {
  const { projectPath, filePath, content } = args;

  const projectResolved = path.resolve(projectPath);
  const fileResolved = path.resolve(projectResolved, filePath);

  // Impede path traversal fora do projeto.
  if (!fileResolved.startsWith(projectResolved + path.sep)) {
    return `✗ filePath deve estar dentro de projectPath.`;
  }

  if (!fs.existsSync(projectResolved)) {
    return `✗ Projeto não encontrado: ${projectResolved}`;
  }

  try {
    fs.mkdirSync(path.dirname(fileResolved), { recursive: true });
    fs.writeFileSync(fileResolved, content, 'utf-8');
    return `✓ Arquivo escrito: ${path.relative(projectResolved, fileResolved)}`;
  } catch (err: any) {
    return `✗ Erro ao escrever arquivo: ${err.message}`;
  }
}
