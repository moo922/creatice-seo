import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { AiPrompt } from '@creative-seo/database';
import { Repository } from 'typeorm';
import type { AiPromptDto, AiPromptStatus } from '@creative-seo/types';

export interface RenderedPrompt {
  promptName: string;
  version: number;
  systemPrompt: string;
  userPrompt: string;
  schema: Record<string, unknown> | null;
}

export interface RegisterPromptInput {
  promptName: string;
  systemPrompt: string;
  template: string;
  schema?: Record<string, unknown> | null;
  status?: AiPromptStatus;
}

/**
 * Versioned prompt registry. Business services reference prompts by name; long
 * prompt bodies live here (and in the database), never inside service code.
 */
@Injectable()
export class PromptRegistryService {
  constructor(
    @InjectRepository(AiPrompt)
    private readonly prompts: Repository<AiPrompt>,
  ) {}

  async getActive(name: string): Promise<AiPrompt | null> {
    return this.prompts.findOne({ where: { promptName: name, status: 'ACTIVE' } });
  }

  /** Renders a prompt's template with variables and returns it for execution. */
  async render(name: string, variables: Record<string, string>, version?: number): Promise<RenderedPrompt> {
    const prompt = version
      ? await this.prompts.findOne({ where: { promptName: name, version } })
      : await this.getActive(name);
    if (!prompt) {
      throw new NotFoundException(`Prompt "${name}"${version ? ` v${version}` : ''} is not registered or active`);
    }
    return {
      promptName: prompt.promptName,
      version: prompt.version,
      systemPrompt: prompt.systemPrompt,
      userPrompt: renderTemplate(prompt.template, variables),
      schema: prompt.schema,
    };
  }

  async list(): Promise<AiPromptDto[]> {
    const rows = await this.prompts.find({ order: { promptName: 'ASC', version: 'DESC' } });
    return rows.map((row) => this.toDto(row));
  }

  /** Registers a new immutable version (next version number for the name). */
  async register(input: RegisterPromptInput): Promise<AiPromptDto> {
    if (!input.promptName || !input.systemPrompt || !input.template) {
      throw new BadRequestException('promptName, systemPrompt and template are required');
    }
    const latest = await this.prompts
      .createQueryBuilder('prompt')
      .where('prompt.prompt_name = :name', { name: input.promptName })
      .orderBy('prompt.version', 'DESC')
      .getOne();
    const version = (latest?.version ?? 0) + 1;
    const row = this.prompts.create({
      promptName: input.promptName,
      version,
      systemPrompt: input.systemPrompt,
      template: input.template,
      schema: input.schema ?? null,
      status: input.status ?? 'DRAFT',
    });
    const saved = await this.prompts.save(row);
    return this.toDto(saved);
  }

  /** Activates a version; any previously active version becomes DEPRECATED. */
  async activate(name: string, version: number): Promise<AiPromptDto> {
    const target = await this.prompts.findOne({ where: { promptName: name, version } });
    if (!target) {
      throw new NotFoundException(`Prompt "${name}" v${version} not found`);
    }
    await this.prompts
      .createQueryBuilder()
      .update(AiPrompt)
      .set({ status: 'DEPRECATED' })
      .where('prompt_name = :name AND status = :status', { name, status: 'ACTIVE' })
      .execute();
    target.status = 'ACTIVE';
    const saved = await this.prompts.save(target);
    return this.toDto(saved);
  }

  async setStatus(name: string, version: number, status: AiPromptStatus): Promise<AiPromptDto> {
    const target = await this.prompts.findOne({ where: { promptName: name, version } });
    if (!target) {
      throw new NotFoundException(`Prompt "${name}" v${version} not found`);
    }
    target.status = status;
    const saved = await this.prompts.save(target);
    return this.toDto(saved);
  }

  private toDto(row: AiPrompt): AiPromptDto {
    return {
      promptName: row.promptName,
      version: row.version,
      systemPrompt: row.systemPrompt,
      template: row.template,
      schema: row.schema,
      status: row.status,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}

export function renderTemplate(template: string, variables: Record<string, string>): string {
  return template.replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g, (match, key: string) => {
    if (!(key in variables)) {
      throw new BadRequestException(`Missing prompt variable "${key}"`);
    }
    return variables[key]!;
  });
}
