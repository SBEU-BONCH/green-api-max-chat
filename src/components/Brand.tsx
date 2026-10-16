import { MessageCircle } from 'lucide-react';

export function Brand() {
  return (
    <div className="brand" aria-label="MAX через GREEN-API">
      <span className="brand-mark">
        <MessageCircle size={25} strokeWidth={2.4} />
      </span>
      <span className="brand-name">
        MAX<span className="brand-caption">через GREEN-API</span>
      </span>
    </div>
  );
}
