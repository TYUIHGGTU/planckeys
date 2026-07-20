interface Props {
  unsaved: boolean;
  onSave: () => void;
  onDiscard: () => void;
}

export function SaveBar({ unsaved, onSave, onDiscard }: Props) {
  return (
    <div className="save-bar">
      <span className={"status" + (unsaved ? " err" : " ok")}>
        {unsaved ? "有未保存改动" : "已保存"}
      </span>
      <button className="primary" disabled={!unsaved} onClick={onSave}>
        保存
      </button>
      <button disabled={!unsaved} onClick={onDiscard}>
        丢弃
      </button>
    </div>
  );
}
