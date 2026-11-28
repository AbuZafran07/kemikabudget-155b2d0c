import EntertainmentNominativeCard from "@/components/entertainment/EntertainmentNominativeCard";
import { useEntertainmentNominative, useNominativeStatus } from "@/hooks/useEntertainmentNominative";
import type { NominativeSource } from "@/lib/entertainment-nominative";

interface EntertainmentNominativeSectionProps {
  source: NominativeSource;
  editable: boolean;
  documentRef?: string;
  defaultSignerName?: string;
  defaultEntryDate?: string;
}

/**
 * Menampilkan Daftar Nominatif hanya bila dokumen memakai pos yang mewajibkannya
 * (atau sudah pernah diisi). Dipakai di detail realisasi CA dan detail Pengajuan Dana.
 */
const EntertainmentNominativeSection = (props: EntertainmentNominativeSectionProps) => {
  const { data: status } = useNominativeStatus(props.source);
  const { data } = useEntertainmentNominative(props.source);
  if (!status?.required && !data?.header) return null;
  return <EntertainmentNominativeCard {...props} />;
};

export default EntertainmentNominativeSection;
