import { useEffect, useMemo, useRef, useState } from 'react';
import { Project } from '../types/project';
import { listTrash, restoreProject, forceDeleteProject } from '../api/projects';
import ProjectCard, { ProjectListHeader } from './ProjectCard';
import ProjectDetailPanel from './ProjectDetailPanel';

interface TrashViewProps {
  onClose: () => void;
}

export default function TrashView({ onClose }: TrashViewProps) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [restoringId, setRestoringId] = useState<number | null>(null);
  const [forceDeletingId, setForceDeletingId] = useState<number | null>(null);
  /** 詳細パネルで開いている案件のid。一覧と同じく実体ではなくidで持つ。 */
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const restoringIdsRef = useRef<Set<number>>(new Set());
  const forceDeletingIdsRef = useRef<Set<number>>(new Set());

  const fetchTrash = async () => {
    setLoading(true);
    try {
      const res = await listTrash(new URLSearchParams());
      const json = await res.json();
      setProjects(json.data ?? []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchTrash(); }, []);

  const handleRestore = async (id: number) => {
    if (restoringIdsRef.current.has(id)) return;
    restoringIdsRef.current.add(id);
    setRestoringId(id);
    try {
      const res = await restoreProject(id);
      if (res.status === 200) {
        await fetchTrash();
      } else if (res.status === 409 || res.status === 404) {
        const json = await res.json();
        window.alert(json.message || '復元できませんでした。');
      } else {
        window.alert('復元に失敗しました。もう一度お試しください。');
      }
    } catch {
      window.alert('通信に失敗しました。ネットワーク状態を確認してください。');
    } finally {
      restoringIdsRef.current.delete(id);
      setRestoringId(null);
    }
  };

  const handleForceDelete = async (id: number) => {
    if (forceDeletingIdsRef.current.has(id)) return;
    if (!window.confirm('この案件を完全に削除します。この操作は取り消せません。よろしいですか？')) return;
    forceDeletingIdsRef.current.add(id);
    setForceDeletingId(id);
    try {
      const res = await forceDeleteProject(id);
      if (res.status === 204) {
        await fetchTrash();
      } else if (res.status === 409 || res.status === 404) {
        const json = await res.json();
        window.alert(json.message || '完全削除できませんでした。');
      } else {
        window.alert('完全削除に失敗しました。もう一度お試しください。');
      }
    } catch {
      window.alert('通信に失敗しました。ネットワーク状態を確認してください。');
    } finally {
      forceDeletingIdsRef.current.delete(id);
      setForceDeletingId(null);
    }
  };

  /** パネルに出す案件。毎回いまの一覧から引き直し、消えたら自動で閉じる。 */
  const selectedProject = useMemo(
    () => projects.find(p => p.id === selectedId) ?? null,
    [projects, selectedId],
  );

  return (
    <main
      className={`mx-auto max-w-6xl space-y-3 px-4 py-4 transition-[padding] md:px-6 ${
        // md幅では余白を作らずパネルを重ねる(一覧の固定列が収まらず切れるため。AppRootと同じ)。
        selectedProject !== null ? 'lg:pr-[31rem]' : ''
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-slate-700">
          ゴミ箱 <span className="font-normal text-slate-400">{projects.length}件</span>
        </h2>
        <button
          onClick={onClose}
          className="flex min-h-11 shrink-0 items-center rounded-md border border-slate-300 bg-white px-3.5 text-sm text-slate-600 hover:bg-slate-50 md:min-h-9"
        >
          一覧へ戻る
        </button>
      </div>

      {loading && <p className="text-sm text-slate-400 text-center py-8">読み込み中...</p>}

      {!loading && projects.length === 0 && (
        <p className="text-sm text-slate-400 text-center py-8">ゴミ箱は空です</p>
      )}

      {/* 一覧と同じく、1件ごとの箱をやめて境界線で区切った1つの面にする。 */}
      {!loading && projects.length > 0 && (
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          <ProjectListHeader />
          {projects.map(p => (
            <ProjectCard
              key={p.id}
              project={p}
              selected={p.id === selectedId}
              onOpen={project => setSelectedId(project.id)}
            />
          ))}
        </div>
      )}

      {/* 復元・完全削除は一覧ではなく詳細パネルの中に置く(一覧での誤操作を防ぐ)。 */}
      <ProjectDetailPanel
        project={selectedProject}
        variant="trash"
        onClose={() => setSelectedId(null)}
        onRestore={handleRestore}
        onForceDelete={handleForceDelete}
        restoring={selectedProject !== null && restoringId === selectedProject.id}
        forceDeleting={selectedProject !== null && forceDeletingId === selectedProject.id}
      />
    </main>
  );
}
