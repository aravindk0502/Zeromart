import { ArrowLeft } from 'lucide-react';
import { useState } from 'react';

const categories = ['Furniture', 'Home', 'Books', 'Kids', 'Electronics'];
const conditions = ['New', 'Like New', 'Good', 'Usable'];

export default function ListItemPage({ onSubmit, listSuccess, onBack }) {
  const [form, setForm] = useState({
    title: '',
    category: 'Furniture',
    condition: 'Good',
    description: '',
    pickupArea: '',
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit(form);
  };

  return (
    <div className="space-y-4">
      <button
        onClick={onBack}
        className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-white/80 px-3 py-2 text-sm font-semibold text-slate-600 shadow-sm transition hover:bg-amber-50"
      >
        <ArrowLeft size={16} /> Back
      </button>
      <section className="glass-card p-5 sm:p-6">
        <h2 className="text-xl font-semibold text-slate-900">List an item</h2>
        <p className="mt-2 text-sm text-slate-500">Only logged-in users can list, keeping the experience simple and trusted.</p>
        <div className="mt-4 rounded-[1.5rem] border border-dashed border-amber-200 bg-amber-50 p-8 text-center text-sm text-violet-700">
          📷 Photo upload placeholder
        </div>
        <form onSubmit={handleSubmit} className="mt-4 space-y-3">
          <input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Item title" className="w-full rounded-[1.05rem] border border-slate-200 bg-slate-50 px-4 py-3 outline-none transition focus:border-amber-500" />
          <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="w-full rounded-[1.05rem] border border-slate-200 bg-slate-50 px-4 py-3 outline-none transition focus:border-amber-500">
            {categories.map((category) => (
              <option key={category} value={category}>{category}</option>
            ))}
          </select>
          <select value={form.condition} onChange={(e) => setForm({ ...form, condition: e.target.value })} className="w-full rounded-[1.05rem] border border-slate-200 bg-slate-50 px-4 py-3 outline-none transition focus:border-amber-500">
            {conditions.map((condition) => (
              <option key={condition} value={condition}>{condition}</option>
            ))}
          </select>
          <textarea required value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Describe the item" className="min-h-24 w-full rounded-[1.05rem] border border-slate-200 bg-slate-50 px-4 py-3 outline-none transition focus:border-amber-500" />
          <input required value={form.pickupArea} onChange={(e) => setForm({ ...form, pickupArea: e.target.value })} placeholder="Pickup area" className="w-full rounded-[1.05rem] border border-slate-200 bg-slate-50 px-4 py-3 outline-none transition focus:border-amber-500" />
          <button type="submit" className="w-full rounded-[1.05rem] bg-violet-600 px-4 py-3 font-semibold text-white transition-all duration-200 hover:bg-violet-700">Submit listing</button>
        </form>
        {listSuccess && <p className="mt-3 text-sm font-semibold text-violet-700">{listSuccess}</p>}
      </section>
    </div>
  );
}
