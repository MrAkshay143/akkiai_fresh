import { app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';

export interface SkillConfig {
  name: string;
  description: string;
  category?: string;
  author?: string;
  version?: string;
  tags?: string[];
  enabled: boolean;
  isCore: boolean;
}

export interface SkillData extends SkillConfig {
  folderName: string;
  filePath?: string;
  content?: string;
}

export interface ParsedSkill extends Record<string, any> {
  name?: string;
  description?: string;
  author?: string;
  version?: string;
  tags?: string[];
  category?: string;
  body: string;
  filePath: string;
}

const parseSkillMd = (content: string, filePath: string): ParsedSkill | null => {
  const cleaned = content.replace(/^\uFEFF/, '');
  const normalized = cleaned.replace(/\r\n/g, '\n');
  const frontmatterMatch = normalized.match(/^---\s*\n([\s\S]*?)\n---\s*\n/);
  if (!frontmatterMatch) return null;

  const yamlBlock = frontmatterMatch[1];
  const body = normalized.slice(frontmatterMatch[0].length).trim();
  const meta: Record<string, any> = {};

  for (const line of yamlBlock.split('\n')) {
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim();
    let value: any = line.slice(colonIdx + 1).trim();

    if (value.startsWith('[') && value.endsWith(']')) {
      value = value
        .slice(1, -1)
        .split(',')
        .map((item: string) => item.trim().replace(/['"]/g, ''));
    }
    if (value === 'true') value = true;
    else if (value === 'false') value = false;
    else if (
      typeof value === 'string' &&
      ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")))
    ) {
      value = value.slice(1, -1);
    }
    meta[key] = value;
  }

  return { ...meta, body, filePath };
};

export class SkillsService {
  constructor() {
    this.ensureDirs();
  }

  public getCustomSkillsDir(): string {
    const akkiDir = path.join(app.getPath('documents'), 'Akki Data', 'skills', 'custom');
    const stonicDir = path.join(app.getPath('documents'), 'Stonic Data', 'skills', 'custom');
    if (fs.existsSync(akkiDir)) return akkiDir;
    if (fs.existsSync(stonicDir)) return stonicDir;
    if (!fs.existsSync(akkiDir)) {
      try {
        fs.mkdirSync(akkiDir, { recursive: true });
      } catch (_) {}
    }
    return akkiDir;
  }

  public getCoreSkillsDir(): string {
    const coreDir = app.isPackaged
      ? path.join(process.resourcesPath, 'skills', 'core')
      : path.join(process.cwd(), 'skills', 'core');

    if (!app.isPackaged && !fs.existsSync(coreDir)) {
      try {
        fs.mkdirSync(coreDir, { recursive: true });
      } catch (_) {}
    }
    return coreDir;
  }

  private ensureDirs() {
    try {
      const customDir = this.getCustomSkillsDir();
      const stateDir = path.join(customDir, '..', '.states');
      if (!fs.existsSync(stateDir)) {
        fs.mkdirSync(stateDir, { recursive: true });
      }
    } catch (_) {}
  }

  private loadSkillsFromDir(dir: string, isCore: boolean): SkillData[] {
    const skills: SkillData[] = [];
    if (!fs.existsSync(dir)) return skills;

    let entries: fs.Dirent[] = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (_error) {
      return skills;
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) {
        if (entry.isFile() && entry.name.endsWith('.md')) {
          const skillPath = path.join(dir, entry.name);
          try {
            const content = fs.readFileSync(skillPath, 'utf8');
            const parsed = parseSkillMd(content, skillPath);
            if (parsed && parsed.name) {
              const stateFolderName = `core-${entry.name.replace('.md', '')}`;
              const statePath = path.join(this.getCustomSkillsDir(), '..', '.states', `${stateFolderName}.json`);
              let enabled = true;
              if (fs.existsSync(statePath)) {
                try {
                  const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
                  enabled = state.enabled !== false;
                } catch (_stateError) {
                  enabled = true;
                }
              }

              skills.push({
                name: parsed.name,
                description: parsed.description || '',
                author: parsed.author || 'Akki Ai',
                version: parsed.version || '1.0.0',
                tags: Array.isArray(parsed.tags) ? parsed.tags : [],
                enabled,
                folderName: entry.name,
                filePath: skillPath,
                isCore: true,
                category: parsed.category || 'Core',
                content: parsed.body || '',
              });
            }
          } catch (error: any) {
            console.error(`[Skills] Error reading flat skill ${entry.name}:`, error?.message);
          }
        }
        continue;
      }

      const skillPath = path.join(dir, entry.name, 'SKILL.md');
      if (!fs.existsSync(skillPath)) continue;

      try {
        const content = fs.readFileSync(skillPath, 'utf8');
        const parsed = parseSkillMd(content, skillPath);
        if (parsed && parsed.name) {
          let statePath = path.join(dir, entry.name, '.state.json');
          if (isCore) {
            const stateDir = path.join(this.getCustomSkillsDir(), '..', '.states');
            if (!fs.existsSync(stateDir)) fs.mkdirSync(stateDir, { recursive: true });
            statePath = path.join(stateDir, `core-${entry.name}.json`);
          }

          let enabled = true;
          if (fs.existsSync(statePath)) {
            try {
              const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
              enabled = state.enabled !== false;
            } catch (_stateError) {
              enabled = true;
            }
          }

          skills.push({
            name: parsed.name,
            description: parsed.description || '',
            author: parsed.author || 'Unknown',
            version: parsed.version || '1.0.0',
            tags: Array.isArray(parsed.tags) ? parsed.tags : [],
            enabled,
            folderName: entry.name,
            filePath: skillPath,
            isCore,
            category: parsed.category || (isCore ? 'Core' : 'Custom'),
            content: parsed.body || '',
          });
        }
      } catch (error: any) {
        console.error(`[Skills] Error reading skill ${entry.name}:`, error?.message);
      }
    }

    return skills;
  }

  public getAllSkills(): { success: boolean; skills: SkillData[] } {
    try {
      const coreSkills = this.loadSkillsFromDir(this.getCoreSkillsDir(), true);
      const customSkills = this.loadSkillsFromDir(this.getCustomSkillsDir(), false);
      const mergedSkills = [...customSkills];

      for (const coreSkill of coreSkills) {
        if (!mergedSkills.find((skill) => skill.name === coreSkill.name)) {
          mergedSkills.push(coreSkill);
        }
      }

      return { success: true, skills: mergedSkills };
    } catch (error: any) {
      console.error('[Skills] Failed to get all skills:', error);
      return { success: false, skills: [] };
    }
  }

  public listSkills(): SkillData[] {
    return this.getAllSkills().skills;
  }

  public loadSkillContent(skillName: string): { success: boolean; content?: string; metadata?: any; isCore?: boolean; error?: string } {
    try {
      const allSkills = this.listSkills();
      const skillMeta = allSkills.find((skill) => skill.name === skillName || skill.folderName === skillName);

      if (!skillMeta || !skillMeta.filePath || !fs.existsSync(skillMeta.filePath)) {
        return { success: false, error: `Skill "${skillName}" not found` };
      }

      const content = fs.readFileSync(skillMeta.filePath, 'utf8');
      const parsed = parseSkillMd(content, skillMeta.filePath);
      if (parsed) {
        return { success: true, content: parsed.body, metadata: parsed, isCore: skillMeta.isCore };
      }

      return { success: false, error: `Failed to parse skill "${skillName}"` };
    } catch (error: any) {
      return { success: false, error: `Failed to load skill: ${error.message}` };
    }
  }

  public saveSkill(data: {
    name: string;
    description?: string;
    author?: string;
    version?: string;
    tags?: string[] | string;
    content: string;
    folderName?: string;
    isCore?: boolean;
    category?: string;
  }): { success: boolean; filePath?: string; folderName?: string; error?: string } {
    try {
      const customSkillsDir = this.getCustomSkillsDir();
      let safeFolderName = data.folderName || data.name.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-');
      safeFolderName = safeFolderName.replace('.md', '');

      const skillDir = path.join(customSkillsDir, safeFolderName);
      if (!fs.existsSync(skillDir)) fs.mkdirSync(skillDir, { recursive: true });

      const tagsStr = Array.isArray(data.tags)
        ? `[${data.tags.join(', ')}]`
        : (data.tags || '[]');
      const frontmatter = [
        '---',
        `name: ${data.name}`,
        `description: ${data.description || ''}`,
        `author: ${data.author || 'User'}`,
        `version: ${data.version || '1.0.0'}`,
        `tags: ${tagsStr}`,
        '---',
      ].join('\n');

      const fullContent = `${frontmatter}\n\n${data.content || `# ${data.name}\n\nAdd your skill instructions here.`}`;
      const skillPath = path.join(skillDir, 'SKILL.md');
      fs.writeFileSync(skillPath, fullContent, 'utf8');

      return { success: true, filePath: skillPath, folderName: safeFolderName };
    } catch (error: any) {
      return { success: false, error: `Failed to save skill: ${error.message}` };
    }
  }

  public deleteSkill(folderName: string, isCore?: boolean): { success: boolean; error?: string } {
    try {
      if (isCore) {
        return { success: false, error: 'Core skills cannot be deleted.' };
      }

      const skillDir = path.join(this.getCustomSkillsDir(), folderName);
      if (!fs.existsSync(skillDir)) return { success: false, error: 'Skill folder not found' };

      fs.rmSync(skillDir, { recursive: true, force: true });
      return { success: true };
    } catch (error: any) {
      return { success: false, error: `Failed to delete skill: ${error.message}` };
    }
  }

  public toggleSkill(folderName: string, enabled: boolean, isCore?: boolean): { success: boolean; error?: string } {
    try {
      let statePath: string;
      if (isCore) {
        const stateDir = path.join(this.getCustomSkillsDir(), '..', '.states');
        if (!fs.existsSync(stateDir)) fs.mkdirSync(stateDir, { recursive: true });
        statePath = path.join(stateDir, `core-${folderName.replace('.md', '')}.json`);
      } else {
        const skillDir = path.join(this.getCustomSkillsDir(), folderName);
        if (!fs.existsSync(skillDir)) return { success: false, error: 'Skill not found' };
        statePath = path.join(skillDir, '.state.json');
      }

      fs.writeFileSync(statePath, JSON.stringify({ enabled }), 'utf8');
      return { success: true };
    } catch (error: any) {
      return { success: false, error: `Failed to toggle skill: ${error.message}` };
    }
  }
}
