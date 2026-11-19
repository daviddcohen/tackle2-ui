import { useTranslation } from "react-i18next";

import { Agent } from "@app/agentic";

/**
 * The count summary of an agent's skills: only
 * the non-zero parts, "2 skills", "1 collection" or "4 skills, 1 collection".
 * Undefined when the agent has neither, which callers render as "None".
 */
export const useAgentSkillsSummary = () => {
  const { t } = useTranslation();
  return ({
    skills,
    skillCollections,
  }: Pick<Agent, "skills" | "skillCollections">): string | undefined => {
    const skillCount = skills.length;
    const collectionCount = skillCollections?.length ?? 0;
    const skillsText =
      skillCount > 0
        ? t("agentic.agent.skillsSummary.skills", { count: skillCount })
        : undefined;
    const collectionsText =
      collectionCount > 0
        ? t("agentic.agent.skillsSummary.collections", {
            count: collectionCount,
          })
        : undefined;
    return skillsText != null && collectionsText != null
      ? t("agentic.agent.skillsSummary.both", {
          skills: skillsText,
          collections: collectionsText,
        })
      : (skillsText ?? collectionsText);
  };
};
