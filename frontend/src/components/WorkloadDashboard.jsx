import React, { useState, useEffect } from 'react';
import { Gauge, RefreshCw, AlertTriangle, CheckCircle2, Wrench, X } from 'lucide-react';

const ALL_7_MEMBERS = [
  { prenom: "Henri", role: "Coordinateur", color: "from-cyan-500 to-blue-600", border: "border-cyan-500" },
  { prenom: "Hortense", role: "Associé", color: "from-rose-500 to-pink-600", border: "border-rose-500" },
  { prenom: "Marguerite", role: "Associé", color: "from-purple-500 to-indigo-600", border: "border-purple-500" },
  { prenom: "Eugénie", role: "Associé", color: "from-amber-500 to-orange-600", border: "border-amber-500" },
  { prenom: "Joséphine", role: "Associé", color: "from-emerald-500 to-teal-600", border: "border-emerald-500" },
  { prenom: "Élisabeth", role: "Associé", color: "from-teal-500 to-emerald-600", border: "border-teal-500" },
  { prenom: "Frédéric", role: "Associé", color: "from-blue-500 to-indigo-600", border: "border-blue-500" },
];

const MEMBER_TASKS_REGISTRY = {
  Henri: [
    {
      id: "t-henri-1",
      title: "Effondrement placo bibliothèque & devis Riffael/Denis",
      category: "🛠️ Maintenance / Réparation",
      priority: "URGENT",
      status: "EN_COURS",
      cost: 650,
      responsible: "Henri & Artisans Riffael/Denis",
      description: "Mur à refermer d'urgence suite à une infiltration d'eau. Travaux de plâtrerie et remise en peinture.",
      notes: "Devis Riffael & Denis validé directement par Henri. Infiltration stoppée, plaquiste mandaté."
    },
    {
      id: "t-henri-2",
      title: "Vérification & commande fioul Éts JOSSE",
      category: "🔥 Chauffage & Fioul",
      priority: "HAUTE",
      status: "EN_COURS",
      cost: 1800,
      responsible: "Henri & Éts JOSSE",
      description: "Vérification mécanique de la jauge extérieure et commande de fioul estivale auprès des Éts JOSSE.",
      notes: "Commande d'été passée au tarif préférentiel. Remplissage prévu avant les mois froids."
    },
    {
      id: "t-henri-3",
      title: "Inspection toiture & devis gouttières Riffael/Denis",
      category: "➕ Nouveau Projet",
      priority: "URGENT",
      status: "EN_VOTE",
      cost: 2400,
      responsible: "Henri & Riffael/Denis",
      description: "Vérification des tuiles, démoussage et réfection des gouttières en zinc.",
      notes: "Projet soumis au vote des associés SCI."
    }
  ],
  Hortense: [
    {
      id: "t-hortense-1",
      title: "Suivi du jardinier Perrot & espaces verts",
      category: "🌿 Espaces Verts",
      priority: "HAUTE",
      status: "EN_COURS",
      cost: 3900,
      responsible: "Hortense & Jardinier Perrot",
      description: "Contrôler le passage d'entretien du jardinier EI PERROT LAURENT (3 900 €/an), arrosage du potager et massif des roses.",
      notes: "Renégociation du devis et périmètre de tonte initiée avec Alex."
    },
    {
      id: "t-hortense-2",
      title: "Wi-Fi Starlink & répéteurs inter-maisons",
      category: "📶 Réseau & Wi-Fi",
      priority: "MOYENNE",
      status: "VALIDE",
      cost: 0,
      responsible: "Hortense & Henri",
      description: "Installation des répéteurs Wi-Fi entre la maison principale et Rosing pour supprimer l'abonnement en double.",
      notes: "Installation validée lors de la réunion du 8 août 2026."
    }
  ],
  Marguerite: [
    {
      id: "t-marguerite-1",
      title: "Consolidation en 1 frigo Schtroudel unique",
      category: "✨ Amélioration",
      priority: "HAUTE",
      status: "EN_VOTE",
      cost: 950,
      responsible: "Marguerite & Hortense",
      description: "Suppression des 4-5 vieux réfrigérateurs obsolètes pour acquérir un grand frigo familial Schtroudel éco-énergétique Classe A+++.",
      notes: "Projet en cours de vote par les associés de la SCI."
    },
    {
      id: "t-marguerite-2",
      title: "Gestion frigo Schtroudel & buanderie",
      category: "🧺 Équipements & Buanderie",
      priority: "MOYENNE",
      status: "EN_COURS",
      cost: 0,
      responsible: "Marguerite",
      description: "Centralisation de la nourriture dans le réfrigérateur unique et vérification des équipements de buanderie.",
      notes: "Gestion quotidienne lors des séjours à Hellenvilliers."
    }
  ],
  Eugénie: [
    {
      id: "t-eugenie-1",
      title: "Peinture écaillée salles de bain du haut",
      category: "🛠️ Maintenance / Réparation",
      priority: "HAUTE",
      status: "EN_COURS",
      cost: 350,
      responsible: "Eugénie & Élisabeth",
      description: "Pellicules toxiques au-dessus de la baignoire. Traitement fongicide, ponçage et application de sous-couche hydrofuge.",
      notes: "Achat de la peinture hydrofuge fait par Eugénie."
    },
    {
      id: "t-eugenie-2",
      title: "Contrôle humidité SdB & Tri sélectif déchets",
      category: "♻️ Tri & Hygiène",
      priority: "MOYENNE",
      status: "EN_COURS",
      cost: 0,
      responsible: "Eugénie",
      description: "Aération de la salle de bain du haut et organisation de la sortie des bacs de recyclage (mardi) et ordures (jeudi).",
      notes: "Consigne d'aération permanente activée."
    }
  ],
  Joséphine: [
    {
      id: "t-josephine-1",
      title: "Tri et don des vêtements d'enfance dans les armoires",
      category: "✨ Amélioration",
      priority: "BASSE",
      status: "EN_COURS",
      cost: 0,
      responsible: "Joséphine & Hortense",
      description: "Tri complet des armoires et penderies de l'étage, mise en sacs des anciens vêtements et don à la Croix-Rouge.",
      notes: "Action bénévole programmée sur le séjour d'été."
    },
    {
      id: "t-josephine-2",
      title: "Vérification des clés & boîtier sécurisé Sud (Code: 4829)",
      category: "🔑 Accès & Sécurité",
      priority: "HAUTE",
      status: "VALIDE",
      cost: 0,
      responsible: "Joséphine",
      description: "Contrôle de la présence du jeu de clés de secours et remise du passe dans le boîtier à digicode (4829) du portail Sud.",
      notes: "Fiche Vademecum mise à jour."
    }
  ],
  Élisabeth: [
    {
      id: "t-elisabeth-1",
      title: "Inspection propreté & charte de séjour",
      category: "🧹 Ménage & Charte",
      priority: "MOYENNE",
      status: "EN_COURS",
      cost: 0,
      responsible: "Élisabeth (Maman)",
      description: "Contrôle du respect des consignes de départ (vaisselle, frigo propre, aspirateur) et tenue générale de la maison.",
      notes: "Responsabilité permanente sur le domaine d'Hellenvilliers."
    },
    {
      id: "t-elisabeth-2",
      title: "Organisation journées grand nettoyage (Printemps & Septembre)",
      category: "🗓️ Gouvernance",
      priority: "HAUTE",
      status: "PLANIFIE",
      cost: 0,
      responsible: "Élisabeth & Joséphine",
      description: "Planification des 2 week-ends annuels de grand ménage et réorganisation des hangars et penderies.",
      notes: "Prochain week-end de ménage de rentrée prévu fin septembre."
    }
  ],
  Frédéric: [
    {
      id: "t-frederic-1",
      title: "Normalisation du tableau électrique (Linky Tempo)",
      category: "⚡ Électricité",
      priority: "HAUTE",
      status: "EN_COURS",
      cost: 480,
      responsible: "Frédéric & SARL Elec Chambray",
      description: "Pose d'un contacteur 0/HC/Marche forcée sur le tableau électrique pour basculer automatiquement sur EDF Tempo.",
      notes: "Artisan SARL Elec Chambray mandaté pour l'intervention."
    },
    {
      id: "t-frederic-2",
      title: "Relevé compteurs Eau & Linky Tempo (HP/HC)",
      category: "📊 Métrologie & Énergie",
      priority: "MOYENNE",
      status: "EN_COURS",
      cost: 0,
      responsible: "Frédéric",
      description: "Relevé périodique des index du compteur d'eau (cave) et contrôle des tranches d'heures creuses du compteur Linky.",
      notes: "Suivi des consommations de fluides."
    }
  ]
};

export function TaskDetailModal({ task, onClose }) {
  if (!task) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl border border-slate-200 max-w-lg w-full p-6 shadow-2xl space-y-5">
        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 rounded-2xl bg-indigo-50 text-indigo-600 border border-indigo-200">
              <Wrench className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-slate-900">
                {task.title}
              </h3>
              <p className="text-xs text-slate-500 font-semibold">
                Référent(e) : <span className="text-indigo-600 font-bold">{task.memberName}</span>
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4 text-xs">
          <div className="flex flex-wrap gap-2 items-center">
            {task.category && (
              <span className="px-2.5 py-1 rounded-full bg-slate-100 text-slate-800 font-bold border border-slate-200">
                {task.category}
              </span>
            )}

            {task.status && (
              <span className={`px-2.5 py-1 rounded-full font-extrabold border ${
                task.status === 'EN_VOTE' ? 'bg-amber-100 text-amber-900 border-amber-300' :
                task.status === 'VALIDE' ? 'bg-emerald-100 text-emerald-900 border-emerald-300' :
                'bg-blue-100 text-blue-900 border-blue-300'
              }`}>
                {task.status === 'EN_VOTE' ? '🗳️ En Vote SCI' :
                 task.status === 'VALIDE' ? '✅ Validé' : '🛠️ En cours d\'exécution'}
              </span>
            )}

            {task.priority && (
              <span className="px-2.5 py-1 rounded-full bg-rose-100 text-rose-900 font-black border border-rose-300">
                {task.priority}
              </span>
            )}
          </div>

          {task.description && (
            <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200/80 space-y-1">
              <span className="text-[10px] uppercase font-bold text-slate-400 block">Description de la mission</span>
              <p className="text-slate-800 leading-relaxed font-medium">{task.description}</p>
            </div>
          )}

          {task.notes && (
            <div className="p-3 bg-indigo-50/60 rounded-2xl border border-indigo-200/60 space-y-1">
              <span className="text-[10px] uppercase font-bold text-indigo-700 block">Notes du Coordinateur / Avancement</span>
              <p className="text-indigo-950 leading-relaxed font-medium">{task.notes}</p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3 pt-1">
            {task.responsible && (
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                <span className="text-[10px] text-slate-400 font-bold block">Responsables désignés</span>
                <span className="text-xs font-bold text-slate-900">{task.responsible}</span>
              </div>
            )}
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
              <span className="text-[10px] text-slate-400 font-bold block">Coût Estimé</span>
              <span className="text-xs font-black text-indigo-600">
                {task.cost ? `${task.cost} € TTC` : 'Inclus / Bénévole'}
              </span>
            </div>
          </div>
        </div>

        <div className="pt-3 border-t border-slate-100 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl shadow transition"
          >
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
}

export default function WorkloadDashboard() {
  const [workloadData, setWorkloadData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState(null);
  const [totalChargePoints, setTotalChargePoints] = useState(100);
  const [selectedTask, setSelectedTask] = useState(null);

  const loadWorkload = async () => {
    try {
      setLoading(true);
      setErrorMsg(null);
      const res = await fetch(`/api/workload/summary?total_charge_points=${totalChargePoints}`);
      if (res.ok) {
        const data = await res.json();
        setWorkloadData(data);
      } else {
        throw new Error(`HTTP ${res.status}: ${res.statusText || 'Échec de réponse serveur'}`);
      }
    } catch (err) {
      console.error('Workload API error:', err);
      setErrorMsg(err.message || String(err) || 'Impossible de charger la jauge de charge');
      setWorkloadData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadWorkload();
  }, [totalChargePoints]);

  const statsMap = {};
  if (workloadData && workloadData.user_stats) {
    workloadData.user_stats.forEach(st => {
      statsMap[st.user_name] = st;
    });
  }

  return (
    <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 shadow-sm space-y-6">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
        <div className="flex items-center space-x-3">
          <div className="p-3 rounded-2xl bg-indigo-50 text-indigo-600 border border-indigo-200">
            <Gauge className="h-6 w-6" />
          </div>
          <div>
            <h2 className="text-lg font-extrabold text-slate-900">Jauge de Répartition des Charges (7 Membres)</h2>
            <p className="text-xs text-slate-500">Usage Proportionnel & Répartition SCI • Cliquez sur une tâche pour afficher la fiche</p>
          </div>
        </div>

        <button
          onClick={loadWorkload}
          className="flex items-center space-x-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 transition shrink-0"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Actualiser les jauges</span>
        </button>
      </div>

      {/* Prominent Red Alert Card on API Failure */}
      {errorMsg ? (
        <div className="p-6 rounded-3xl bg-rose-50 border-2 border-rose-500 text-rose-900 shadow-md animate-in fade-in duration-200">
          <div className="flex items-start space-x-4">
            <div className="p-3 bg-rose-600 text-white rounded-2xl shrink-0">
              <AlertTriangle className="h-7 w-7" />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-black text-rose-950 flex items-center gap-2">
                <span>⚠️ Erreur de lecture capteur / API</span>
              </h3>
              <p className="text-xs text-rose-700 font-bold mt-1">
                Échec de connexion à l'API de charge d'occupation. Aucun masquage silencieux.
              </p>
              <div className="mt-3 p-3 bg-rose-100/90 border border-rose-300 rounded-xl font-mono text-xs text-rose-950 break-all">
                <strong>Raw error trace :</strong> {errorMsg}
              </div>
              <div className="mt-4 flex items-center space-x-3">
                <button
                  onClick={loadWorkload}
                  disabled={loading}
                  className="px-5 py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-extrabold text-xs rounded-xl shadow transition flex items-center space-x-2"
                >
                  <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                  <span>Enquêter / Réessayer</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* Gauges & Clickable Task Badges for the 7 Members */}
          <div className="space-y-4 pt-2">
            {ALL_7_MEMBERS.map((member) => {
              const st = statsMap[member.prenom] || { total_days: 0, occupation_score: 0, target_charge_points: 0, charge_percentage: 0 };
              const pct = Math.min(100, Math.max(0, st.charge_percentage || 0));
              const memberTasks = MEMBER_TASKS_REGISTRY[member.prenom] || [];

              return (
                <div
                  key={member.prenom}
                  className="p-4 sm:p-5 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-3 transition hover:border-indigo-300 shadow-xs"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <div className={`w-10 h-10 rounded-2xl bg-gradient-to-br ${member.color} text-white flex items-center justify-center font-black text-sm shadow-sm shrink-0`}>
                        {member.prenom[0]}
                      </div>
                      <div>
                        <div className="flex items-center space-x-2">
                          <h4 className="text-sm font-extrabold text-slate-900">{member.prenom}</h4>
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-200 text-slate-700 font-bold">
                            {member.role}
                          </span>
                        </div>
                        <span className="text-[11px] text-slate-500">
                          {st.total_days} jour(s) d'occupation • Score d'usage : <strong className="text-slate-800">{st.occupation_score} pts</strong>
                        </span>
                      </div>
                    </div>

                    <div className="text-right">
                      <span className="text-xs font-black text-indigo-600 block">
                        {st.target_charge_points} pts / 100
                      </span>
                      <span className="text-[10px] font-bold text-slate-500">
                        {pct}% de la charge SCI
                      </span>
                    </div>
                  </div>

                  {/* Progress Bar / Gauge */}
                  <div className="w-full h-3 rounded-full bg-slate-200 overflow-hidden flex shadow-inner">
                    <div
                      style={{ width: `${pct}%` }}
                      className={`h-full bg-gradient-to-r ${member.color} transition-all duration-500 rounded-full`}
                    ></div>
                  </div>

                  {/* Clickable Task Badges per Member */}
                  <div className="pt-2 border-t border-slate-200/60 flex flex-wrap items-center gap-2">
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1 mr-1 shrink-0">
                      <CheckCircle2 className="w-3 h-3 text-indigo-600" />
                      Tâches ({memberTasks.length}) :
                    </span>
                    {memberTasks.map((task) => (
                      <button
                        key={task.id}
                        onClick={() => setSelectedTask({ ...task, memberName: member.prenom })}
                        className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-xl text-[11px] font-bold bg-white hover:bg-indigo-50 text-indigo-950 border border-slate-200 hover:border-indigo-300 transition-all shadow-xs cursor-pointer hover:scale-[1.02]"
                        title="Cliquer pour afficher la fiche détaillée"
                      >
                        <span className={`w-2 h-2 rounded-full ${
                          task.status === 'EN_VOTE' ? 'bg-amber-500 animate-pulse' :
                          task.status === 'VALIDE' ? 'bg-emerald-500' : 'bg-indigo-500'
                        }`}></span>
                        <span className="truncate max-w-[220px]">📋 {task.title}</span>
                        {task.cost > 0 && (
                          <span className="text-[9px] font-mono font-bold bg-indigo-100 text-indigo-800 px-1.5 py-0.2 rounded-md">
                            {task.cost}€
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Task Detail Modal */}
      <TaskDetailModal task={selectedTask} onClose={() => setSelectedTask(null)} />

    </div>
  );
}



