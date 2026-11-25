import { useContext } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AxiosError } from "axios";
import { useTranslation } from "react-i18next";

import type { Archetype, TargetProfile } from "@app/api/models";
import { NotificationsContext } from "@app/components/NotificationsContext";
import { invalidateAgentic } from "@app/queries/agentic";
import {
  ARCHETYPES_QUERY_KEY,
  ARCHETYPE_QUERY_KEY,
  useCreateArchetypeMutation,
  useDeleteArchetypeMutation,
  useUpdateArchetypeMutation,
} from "@app/queries/archetypes";
import { useDeleteAssessmentMutation } from "@app/queries/assessments";
import { useDeleteReviewMutation } from "@app/queries/reviews";
import { getAxiosErrorMessage } from "@app/utils/utils";

export interface UseArchetypeMutationsOptions {
  onActionSuccess?: () => void;
  onActionFail?: () => void;
}

export const useArchetypeMutations = ({
  onActionSuccess = () => {},
  onActionFail = () => {},
}: UseArchetypeMutationsOptions = {}) => {
  const { t } = useTranslation();
  const { pushNotification } = useContext(NotificationsContext);
  const queryClient = useQueryClient();

  // Common error handler
  const onError = (error: AxiosError) => {
    pushNotification({
      title: getAxiosErrorMessage(error),
      variant: "danger",
    });
    onActionFail();
  };

  // Create archetype success handler
  const onCreateSuccess = (archetype: Archetype) => {
    pushNotification({
      title: t("toastr.success.createWhat", {
        type: t("terms.archetype"),
        what: archetype.name,
      }),
      variant: "success",
    });
    onActionSuccess();
  };

  // Update archetype success handler
  const onUpdateSuccess = (_updatedArchetype: Archetype) => {
    pushNotification({
      title: t("toastr.success.save", {
        type: t("terms.archetype"),
      }),
      variant: "success",
    });
    onActionSuccess();
  };

  // Delete archetype success handler
  const onDeleteSuccess = (archetypeDeleted: Archetype) => {
    pushNotification({
      title: t("toastr.success.deletedWhat", {
        what: archetypeDeleted.name,
        type: t("terms.archetype"),
      }),
      variant: "success",
    });
  };

  // Delete review success handler
  const onDeleteReviewSuccess = (name: string) => {
    pushNotification({
      title: t("toastr.success.reviewDiscarded", {
        application: name,
      }),
      variant: "success",
    });
  };

  // Mutations
  const { mutate: createArchetype } = useCreateArchetypeMutation(
    onCreateSuccess,
    onError
  );

  const { mutate: updateArchetype } = useUpdateArchetypeMutation(
    onUpdateSuccess,
    onError
  );

  const { mutate: deleteArchetype } = useDeleteArchetypeMutation(
    onDeleteSuccess,
    onError
  );

  const { mutateAsync: deleteAssessment } = useDeleteAssessmentMutation();
  const { mutateAsync: deleteReview } = useDeleteReviewMutation(
    onDeleteReviewSuccess,
    onError
  );

  // Discard assessment function
  const discardAssessment = (archetype: Archetype) => {
    if (!archetype.assessments) {
      return;
    }
    Promise.all(
      archetype.assessments.map((assessment) =>
        deleteAssessment({
          assessmentId: assessment.id,
          archetypeId: archetype.id,
        })
      )
    )
      .then(() => {
        pushNotification({
          title: t("toastr.success.assessmentDiscarded", {
            application: archetype.name,
          }),
          variant: "success",
        });
        queryClient.invalidateQueries({ queryKey: [ARCHETYPES_QUERY_KEY] });
        queryClient.invalidateQueries({
          queryKey: [ARCHETYPE_QUERY_KEY, String(archetype.id)],
        });
      })
      .catch((error) => {
        console.error("Error while deleting assessments:", error);
        pushNotification({
          title: getAxiosErrorMessage(error as AxiosError),
          variant: "danger",
        });
      });
  };

  // Discard review function
  const discardReview = (archetype: Archetype) => {
    if (!archetype.review?.id) {
      return;
    }
    deleteReview({
      id: archetype.review.id,
      name: archetype.name,
    })
      .then(() => {
        queryClient.invalidateQueries({ queryKey: [ARCHETYPES_QUERY_KEY] });
        queryClient.invalidateQueries({
          queryKey: [ARCHETYPE_QUERY_KEY, String(archetype.id)],
        });
      })
      .catch((error) => {
        console.error("Error while deleting review:", error);
        pushNotification({
          title: getAxiosErrorMessage(error as AxiosError),
          variant: "danger",
        });
      });
  };

  // Delete target profile success handler
  const onDeleteTargetProfileSuccess = (_updatedArchetype: Archetype) => {
    // The plan it used loses a migration path, and its applications too.
    void invalidateAgentic(queryClient, "targetProfile");
    pushNotification({
      title: t("toastr.success.targetProfileDeleted"),
      variant: "success",
    });
    onActionSuccess();
  };

  // Delete target profile mutation with its own success handler
  const { mutate: deleteTargetProfileMutation } = useUpdateArchetypeMutation(
    onDeleteTargetProfileSuccess,
    onError
  );

  // Delete target profile function
  const deleteTargetProfile = (
    archetype: Archetype,
    profile: TargetProfile
  ) => {
    const updatedProfiles = archetype.profiles?.filter(
      (p) => p.id !== profile.id
    );
    deleteTargetProfileMutation({ ...archetype, profiles: updatedProfiles });
  };

  return {
    createArchetype,
    updateArchetype,
    deleteArchetype,
    discardAssessment,
    discardReview,
    deleteTargetProfile,
  };
};

/** The fields of a target profile one save changes; the others are kept. */
export type TargetProfileChanges = Partial<Omit<TargetProfile, "id">>;

/**
 * Creates or changes one target profile of an archetype, for a modal that
 * stays open while it saves. Target profiles are part of the archetype, so
 * every save is a PUT of the archetype with its profiles (as upstream does).
 * Pass the archetype as last read: a change is patched onto that copy of the
 * profile, so saving one field cannot revert another changed meanwhile.
 * After a change is saved, the archetype as sent is written to its query
 * cache, so a second save made before the refetch arrives starts from the
 * saved state, not from the copy read before the first save. A new profile
 * is not written there: the hub assigns its id, so the refetch brings it.
 * Each save takes what its success means (a toast, closing the modal); a
 * failure is a toast and the modal stays open with its input.
 */
export const useTargetProfileMutation = () => {
  const { t } = useTranslation();
  const { pushNotification } = useContext(NotificationsContext);
  const queryClient = useQueryClient();
  const { mutate, isPending } = useUpdateArchetypeMutation(
    // Every save passes its own success handler.
    () => {},
    (error: AxiosError) =>
      pushNotification({
        title: getAxiosErrorMessage(error),
        variant: "danger",
      })
  );

  const createTargetProfile = (
    archetype: Archetype,
    profile: Omit<TargetProfile, "id">,
    onSuccess: () => void
  ) =>
    mutate(
      {
        ...archetype,
        // The hub assigns the id.
        profiles: [...(archetype.profiles ?? []), { ...profile, id: 0 }],
      },
      {
        onSuccess: () => {
          // A new migration path for the archetype's applications.
          void invalidateAgentic(queryClient, "targetProfile");
          onSuccess();
        },
      }
    );

  /**
   * Saves `changes` onto `profile` as `archetype` has it. When `archetype`
   * no longer has the profile (deleted since the modal opened), nothing is
   * saved: a toast says so and `onGone` runs.
   */
  const updateTargetProfile = (
    archetype: Archetype,
    profile: TargetProfile,
    changes: TargetProfileChanges,
    { onSuccess, onGone }: { onSuccess: () => void; onGone: () => void }
  ) => {
    if (!archetype.profiles?.some(({ id }) => id === profile.id)) {
      pushNotification({
        title: t("agentic.archetype.profileGone", { profile: profile.name }),
        variant: "danger",
      });
      onGone();
      return;
    }
    const updated: Archetype = {
      ...archetype,
      profiles: archetype.profiles.map((current) =>
        current.id === profile.id ? { ...current, ...changes } : current
      ),
    };
    mutate(updated, {
      onSuccess: () => {
        queryClient.setQueryData(
          [ARCHETYPE_QUERY_KEY, String(updated.id)],
          updated
        );
        // Plans and migration views name the profile.
        if (changes.name != null && changes.name !== profile.name) {
          void invalidateAgentic(queryClient, "targetProfile");
        }
        onSuccess();
      },
    });
  };

  return { createTargetProfile, updateTargetProfile, isPending };
};
