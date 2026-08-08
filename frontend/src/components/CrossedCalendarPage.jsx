import React, { useState, useEffect } from 'react';
import { Calendar, Sparkles, CheckCircle2, AlertCircle, HelpCircle, XCircle, Users, Award, ChevronRight } from 'lucide-react';
import { fetchAvailabilities, setAvailability, fetchSmartMatch } from '../api';

export default function CrossedCalendarPage({ properties, currentUser }) {
  const [selectedProperty, setSelectedProperty] = useState(properties[0]?.id || 1);
  const [selectedYear, setSelectedYear] = useState(2026);
  const [availabilities, setAvailabilities] = useState([]);
  const [smartMatches, setSmartMatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);

  const familyMembers = ['Henri Jamet', 'Marie Jamet', 'Pierre Jamet', 'Luc Jamet', 'Parents Jamet'];

  const loadData = async () => {
    try {
      setLoading(true);
      const [availData, matchData] = await Promise.all([
        fetchAvailabilities(selectedProperty, selectedYear),
        fetchSmartMatch(selectedProperty, selectedYear)
      ]);
      setAvailabilities(availData);
      setSmartMatches(matchData);
    } catch (err) {
      console.error('Error loading availability data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [selectedProperty, selectedYear]);

  // Weeks list to display in crossed table (Weeks 25 to 36 for Summer/Autumn + key weeks)
  const keyWeeks = [25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 42, 52];

  const getMemberStatus = (weekNum, memberName) => {
    const found = availabilities.find(
      (a) => a.week_number === weekNum && a.user_name === memberName
    );
    return found ? found.status : 'NON_RENSEIGNE';
  };

  const handleToggleStatus = async (weekNum, currentStatus) => {
    let nextStatus = 'PRESENT';
    if (currentStatus === 'PRESENT') nextStatus = 'OPTIONNEL';
    else if (currentStatus === 'OPTIONNEL') nextStatus = 'IMPOSSIBLE';
    else if (currentStatus === 'IMPOSSIBLE') nextStatus = 'PRESENT';
    else nextStatus = 'PRESENT';

    try {
      setUpdating(true);
      await setAvailability({
        property_id: parseInt(selectedProperty, 10),
        year: selectedYear,
        week_number: weekNum,
        user_name: currentUser,
        status: nextStatus
      });
      await loadData();
    } catch (err) {
      console.error('Failed to update availability:', err);
    } flex: {
      setUpdating(false);
    }
  };

  const renderStatusBadge = (status) => {
    switch (status) {
      case 'PRESENT':
        return (
          <span className="px-2 py-1 rounded-lg text-xs font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 flex items-center justify-center space-x-1 shadow">
            <CheckCircle2 className="h-3.5 w-3.5" />
            <span>Présent</span>
          </span>
        );
      case 'OPTIONNEL':
        return (
          <span className="px-2 py-1 rounded-lg text-xs font-bold bg-amber-500/20 text-amber-400 border border-amber-500/40 flex items-center justify-center space-x-1 shadow">
            <HelpCircle className="h-3.5 w-3.5" />
            <span>Incertain</span>
          </span>
        );
      case 'IMPOSSIBLE':
        return (
          <span className="px-2 py-1 rounded-lg text-xs font-bold bg-rose-500/20 text-rose-400 border border-rose-500/40 flex items-center justify-center space-x-1 shadow">
            <XCircle className="h-3.5 w-3.5" />
            <span>Impossible</span>
          </span>
        );
      default:
        return (
          <span className="px-2 py-1 rounded-lg text-xs font-medium bg-slate-800/60 text-slate-500 flex items-center justify-center">
            —
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      
      {/* Top Banner & Title */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-gradient-to-r from-slate-900 via-slate-900/90 to-indigo-950/40 p-6 rounded-2xl border border-slate-800 shadow-xl">
        <div>
          <div className="flex items-center space-x-2">
            <h1 className="text-2xl font-black text-white tracking-tight">Calendrier Croisé Familial</h1>
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 flex items-center space-x-1">
              <Sparkles className="h-3 w-3 text-amber-400" />
              <span>Smart Matching</span>
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Déclarez vos disponibilités par semaine et identifiez automatiquement les périodes optimales pour vous réunir !
          </p>
        </div>

        {/* Controls */}
        <div className="flex items-center space-x-3">
          <select
            value={selectedProperty}
            onChange={(e) => setSelectedProperty(e.target.value)}
            className="bg-slate-950 border border-slate-800 text-xs font-semibold text-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:border-indigo-500"
          >
            {properties.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>

          <select
            value={selectedYear}
            onChange={(e) => setSelectedYear(parseInt(e.target.value, 10))}
            className="bg-slate-950 border border-slate-800 text-xs font-semibold text-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:border-indigo-500"
          >
            <option value={2026}>Année 2026</option>
            <option value={2027}>Année 2027</option>
          </select>
        </div>
      </div>

      {/* Smart Match Highlight Section */}
      <div className="bg-gradient-to-r from-indigo-950/60 via-slate-900 to-slate-900 border border-indigo-800/40 rounded-2xl p-6 shadow-xl">
        <div className="flex items-center space-x-2 mb-4">
          <div className="p-2 bg-indigo-500/10 rounded-lg text-amber-400">
            <Award className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-white">Smart Match — Semaines Optimales de Retrouvailles</h2>
            <p className="text-xs text-slate-400">L'algorithme calcule les semaines réunissant le maximum de membres de la famille</p>
          </div>
        </div>

        {smartMatches.length === 0 ? (
          <p className="text-xs text-slate-500 italic">Aucune donnée de disponibilité renseignée pour l'instant.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {smartMatches.slice(0, 3).map((match, idx) => (
              <div
                key={match.week_number}
                className={`relative bg-slate-950 border rounded-xl p-4 flex flex-col justify-between transition ${
                  idx === 0
                    ? 'border-amber-500/50 shadow-amber-500/10 shadow-lg bg-gradient-to-b from-amber-950/20 to-slate-950'
                    : 'border-slate-800'
                }`}
              >
                {idx === 0 && (
                  <span className="absolute -top-3 right-3 px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-gradient-to-r from-amber-500 to-amber-600 text-slate-950 shadow">
                    🥇 Top 1 Rencontre
                  </span>
                )}

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-extrabold text-white">Semaine {match.week_number}</span>
                    <span className="text-xs text-slate-400 font-medium">{match.start_date} au {match.end_date}</span>
                  </div>

                  <div className="flex items-center space-x-3 mb-3">
                    <div className="flex items-center space-x-1 text-emerald-400 font-bold text-sm">
                      <Users className="h-4 w-4" />
                      <span>{match.total_present} Présent(s)</span>
                    </div>
                    {match.total_optionnel > 0 && (
                      <span className="text-xs text-amber-400 font-medium">+ {match.total_optionnel} Incertain(s)</span>
                    )}
                  </div>

                  {/* List present members */}
                  <div className="space-y-1 text-xs">
                    {match.present_members.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {match.present_members.map((m) => (
                          <span key={m} className="px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800/40 text-[10px] font-semibold">
                            ✓ {m}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Main Crossed Availability Matrix Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        <div className="p-4 bg-slate-950/60 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Calendar className="h-4 w-4 text-cyan-400" />
            <h3 className="text-sm font-bold text-white">Grille Croisée des Disponibilités par Semaine</h3>
          </div>
          <span className="text-xs text-slate-400">
            Astuce : Cliquez sur une case de votre ligne (<strong className="text-cyan-400">{currentUser}</strong>) pour changer votre statut.
          </span>
        </div>

        {loading ? (
          <div className="py-12 flex justify-center text-slate-400">
            <div className="w-6 h-6 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin"></div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-950 text-slate-400 border-b border-slate-800">
                  <th className="py-3 px-4 font-bold uppercase tracking-wider text-slate-300 w-36">Semaine</th>
                  {familyMembers.map((member) => (
                    <th
                      key={member}
                      className={`py-3 px-4 font-bold uppercase tracking-wider text-center ${
                        member === currentUser ? 'text-cyan-400 bg-cyan-950/30' : 'text-slate-300'
                      }`}
                    >
                      {member}
                      {member === currentUser && <span className="block text-[9px] text-cyan-400/80 font-normal">(Vous)</span>}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {keyWeeks.map((wn) => (
                  <tr key={wn} className="hover:bg-slate-800/40 transition">
                    <td className="py-3 px-4 font-bold text-white bg-slate-950/40">
                      Semaine {wn}
                      <span className="block text-[10px] text-slate-400 font-normal">
                        {wn === 30 ? 'Vacances Été' : wn === 33 ? '15 Août Assomption' : wn === 42 ? 'Toussaint' : wn === 52 ? 'Noël' : ''}
                      </span>
                    </td>

                    {familyMembers.map((member) => {
                      const status = getMemberStatus(wn, member);
                      const isMe = member === currentUser;

                      return (
                        <td
                          key={member}
                          onClick={() => isMe && handleToggleStatus(wn, status)}
                          className={`py-3 px-3 text-center transition ${
                            isMe ? 'cursor-pointer hover:bg-cyan-950/40 bg-cyan-950/10' : ''
                          }`}
                          title={isMe ? 'Cliquer pour basculer : Présent -> Incertain -> Impossible' : ''}
                        >
                          {renderStatusBadge(status)}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

    </div>
  );
}
