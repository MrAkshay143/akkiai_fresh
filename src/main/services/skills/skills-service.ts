import { app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';

export interface SkillConfig {
  name: string;
  description: string;
  category: string;
  enabled: boolean;
  isCore: boolean;
}

export interface SkillData extends SkillConfig {
  folderName: string;
  content: string;
}

const DEFAULT_SKILLS = [
  { folderName: 'web_search', name: 'Web & Live Market Search', description: 'Research', category: 'Research', enabled: true, isCore: true, content: '# Web Search\n\nSkill content goes here.' },
  { folderName: 'deep_search', name: 'Deep Page Reader (Jina)', description: 'Research', category: 'Research', enabled: true, isCore: true, content: '# Deep Search\n\nSkill content goes here.' },
  { folderName: 'open_info_panel', name: 'Native HUD Info Windows', description: 'System', category: 'System', enabled: true, isCore: true, content: '# Open Info Panel\n\nSkill content goes here.' },
  { folderName: 'fs_tools', name: 'Filesystem Safe Access', description: 'System', category: 'System', enabled: true, isCore: true, content: '# FS Tools\n\nSkill content goes here.' },
  { folderName: 'os_exec', name: 'Restricted Terminal Shell', description: 'System', category: 'System', enabled: true, isCore: true, content: '# OS Exec\n\nSkill content goes here.' },
  { folderName: 'agent_town', name: 'Sub-Agent Delegation', description: 'Agents', category: 'Agents', enabled: true, isCore: true, content: '# Agent Town\n\nSkill content goes here.' },
  { folderName: 'media_player', name: 'Neural Media & YouTube', description: 'Media', category: 'Media', enabled: true, isCore: true, content: '# Media Player\n\nSkill content goes here.' }
];

export class SkillsService {
  private skillsDir: string;

  constructor() {
    const userDataPath = app.getPath('userData');
    this.skillsDir = path.join(userDataPath, 'akki-skills');
    this.ensureSkillsDir();
  }

  private ensureSkillsDir() {
    if (!fs.existsSync(this.skillsDir)) {
      fs.mkdirSync(this.skillsDir, { recursive: true });
      this.seedDefaultSkills();
    } else {
      const entries = fs.readdirSync(this.skillsDir);
      if (entries.length === 0) {
        this.seedDefaultSkills();
      }
    }
  }

  private seedDefaultSkills() {
    for (const skill of DEFAULT_SKILLS) {
      const skillPath = path.join(this.skillsDir, skill.folderName);
      if (!fs.existsSync(skillPath)) {
        fs.mkdirSync(skillPath, { recursive: true });
      }
      
      const config: SkillConfig = {
        name: skill.name,
        description: skill.description,
        category: skill.category,
        enabled: skill.enabled,
        isCore: skill.isCore
      };
      
      fs.writeFileSync(path.join(skillPath, 'config.json'), JSON.stringify(config, null, 2), 'utf-8');
      fs.writeFileSync(path.join(skillPath, 'content.md'), skill.content, 'utf-8');
    }
  }

  public listSkills(): SkillData[] {
    const skills: SkillData[] = [];
    if (!fs.existsSync(this.skillsDir)) return skills;

    const entries = fs.readdirSync(this.skillsDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const folderName = entry.name;
        const skillPath = path.join(this.skillsDir, folderName);
        const configPath = path.join(skillPath, 'config.json');
        const contentPath = path.join(skillPath, 'content.md');

        if (fs.existsSync(configPath) && fs.existsSync(contentPath)) {
          try {
            const configData = fs.readFileSync(configPath, 'utf-8');
            const config: SkillConfig = JSON.parse(configData);
            const content = fs.readFileSync(contentPath, 'utf-8');

            skills.push({
              folderName,
              ...config,
              content
            });
          } catch (err) {
            console.error(`[SkillsService] Error reading skill ${folderName}:`, err);
          }
        }
      }
    }
    return skills;
  }

  public toggleSkill(folderName: string, enabled: boolean, isCore: boolean): boolean {
    try {
      const skillPath = path.join(this.skillsDir, folderName);
      const configPath = path.join(skillPath, 'config.json');
      if (!fs.existsSync(configPath)) return false;

      const configData = fs.readFileSync(configPath, 'utf-8');
      const config: SkillConfig = JSON.parse(configData);
      
      // We can ignore isCore matching or just enforce it
      config.enabled = enabled;
      
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
      return true;
    } catch (err) {
      console.error(`[SkillsService] Error toggling skill ${folderName}:`, err);
      return false;
    }
  }

  public saveSkill(data: { name: string; description: string; content: string; folderName: string; isCore: boolean; category?: string }): boolean {
    try {
      const folderName = data.folderName || data.name.toLowerCase().replace(/[^a-z0-9]/g, '_');
      const skillPath = path.join(this.skillsDir, folderName);
      
      if (!fs.existsSync(skillPath)) {
        fs.mkdirSync(skillPath, { recursive: true });
      }

      let config: SkillConfig = {
        name: data.name,
        description: data.description,
        category: data.category || 'Custom',
        enabled: true,
        isCore: data.isCore || false
      };

      const configPath = path.join(skillPath, 'config.json');
      if (fs.existsSync(configPath)) {
        const existingData = fs.readFileSync(configPath, 'utf-8');
        const existingConfig: SkillConfig = JSON.parse(existingData);
        config = { ...existingConfig, ...config }; // merge updates
      }

      fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
      fs.writeFileSync(path.join(skillPath, 'content.md'), data.content, 'utf-8');
      return true;
    } catch (err) {
      console.error(`[SkillsService] Error saving skill:`, err);
      return false;
    }
  }

  public deleteSkill(folderName: string, isCore: boolean): boolean {
    try {
      if (isCore) return false; // Safety check
      
      const skillPath = path.join(this.skillsDir, folderName);
      if (!fs.existsSync(skillPath)) return false;

      fs.rmSync(skillPath, { recursive: true, force: true });
      return true;
    } catch (err) {
      console.error(`[SkillsService] Error deleting skill ${folderName}:`, err);
      return false;
    }
  }

  public loadSkillContent(folderName: string): string {
    try {
      const contentPath = path.join(this.skillsDir, folderName, 'content.md');
      if (fs.existsSync(contentPath)) {
        return fs.readFileSync(contentPath, 'utf-8');
      }
    } catch (err) {
      console.error(`[SkillsService] Error reading skill content for ${folderName}:`, err);
    }
    return '';
  }
}
