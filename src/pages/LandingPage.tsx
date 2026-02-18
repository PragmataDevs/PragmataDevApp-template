import { 
  Users, 
  Mail, 
  ArrowRight, 
  CheckCircle2, 
  Menu,
  X,
  Building2
} from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/Button';

export default function LandingPage() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  return (
    <div className="min-h-screen flex flex-col bg-white text-slate-900 font-sans">
      {/* --- Navegación --- */}
      <header className="fixed w-full bg-white/80 backdrop-blur-md z-50 border-b border-slate-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-2">
              <img 
                src="/pragmata-devs-logo.png" 
                alt="PragmataDevs" 
                className="h-10 w-auto object-contain" 
              />
            </div>
            
            {/* Desktop Nav */}
            <nav className="hidden md:flex items-center gap-8">
              <a href="#features" className="text-slate-600 hover:text-brand-accent transition-colors font-medium text-sm">Características</a>
              <a href="#about" className="text-slate-600 hover:text-brand-accent transition-colors font-medium text-sm">Nosotros</a>
              <a href="#contact" className="text-slate-600 hover:text-brand-accent transition-colors font-medium text-sm">Contacto</a>
              <Link 
                to="/login"
                className="px-5 py-2.5 bg-brand-dark text-white text-sm font-medium rounded-pragmata hover:bg-slate-800 transition-all hover:shadow-lg"
              >
                Iniciar Sesión
              </Link>
            </nav>

            {/* Mobile Menu Button */}
            <button 
              className="md:hidden p-2 text-slate-600 hover:bg-slate-100 rounded-lg"
              onClick={() => setIsMenuOpen(!isMenuOpen)}
            >
              {isMenuOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
          </div>
        </div>

        {/* Mobile Nav */}
        {isMenuOpen && (
          <div className="md:hidden absolute top-16 left-0 w-full bg-white border-b border-slate-100 shadow-xl animate-in slide-in-from-top-2">
            <div className="flex flex-col p-4 space-y-4">
              <a href="#features" className="px-4 py-2 hover:bg-slate-50 rounded-lg text-slate-700" onClick={() => setIsMenuOpen(false)}>Características</a>
              <a href="#about" className="px-4 py-2 hover:bg-slate-50 rounded-lg text-slate-700" onClick={() => setIsMenuOpen(false)}>Nosotros</a>
              <a href="#contact" className="px-4 py-2 hover:bg-slate-50 rounded-lg text-slate-700" onClick={() => setIsMenuOpen(false)}>Contacto</a>
              <Link 
                  to="/login" 
                  className="mx-4 text-center py-3 bg-brand-accent text-white rounded-pragmata font-medium"
                  onClick={() => setIsMenuOpen(false)}
              >
                  Acceder a la Plataforma
              </Link>
            </div>
          </div>
        )}
      </header>

      {/* --- Hero Section --- */}
      <section className="pt-32 pb-16 md:pt-48 md:pb-32 px-4 max-w-7xl mx-auto w-full text-center">
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-700">
          <span className="inline-block py-1 px-3 rounded-pragmata bg-brand-surface text-brand-accent text-xs font-bold tracking-wide border border-brand-border mb-6">
            VERSION 1.0 DISPONIBLE
          </span>
          <h1 className="text-4xl md:text-6xl lg:text-7xl font-extrabold tracking-tight text-brand-dark mb-6 leading-[1.1]">
            Gestión Offline-First para <br className="hidden md:block"/>
            <span className="text-brand-accent">Proyectos Reales</span>
          </h1>
          <p className="max-w-2xl mx-auto text-lg md:text-xl text-slate-600 mb-10 leading-relaxed">
            La plataforma definitiva SaaS para control de obras, campañas y equipos remotos. 
            Sincronización automática, funciona sin internet y escala con tu negocio.
          </p>
          <div className="flex flex-col sm:flex-row justify-center gap-4">
            <Link to="/login" className="inline-flex items-center justify-center px-8 py-3.5 text-base font-medium text-white bg-brand-accent rounded-pragmata hover:bg-brand-accent-dark hover:shadow-xl hover:-translate-y-0.5 transition-all">
              Comenzar Ahora <ArrowRight className="ml-2 h-5 w-5" />
            </Link>
            <Button variant="secondary" size="lg" className="border-brand-border text-brand-steel hover:bg-brand-surface">
              Ver Demo
            </Button>
          </div>
        </div>
      </section>

      {/* --- Features Grid --- */}
      <section id="features" className="py-24 bg-brand-surface">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold tracking-tighter text-brand-dark mb-4">Todo lo que necesitas</h2>
            <p className="text-slate-600 max-w-2xl mx-auto">Diseñado para la eficiencia en campo y la claridad en administración.</p>
          </div>
          
          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                icon: <CheckCircle2 className="h-6 w-6 text-brand-accent" />,
                title: "Offline Nativo",
                desc: "Trabaja sin conexión en sótanos o zonas rurales. Los datos se sincronizan automáticamente al recuperar la red."
              },
              {
                icon: <Users className="h-6 w-6 text-brand-accent" />,
                title: "Colaboración Real",
                desc: "Asigna tareas y roles a contratistas, supervisores y clientes con permisos granulares."
              },
              {
                icon: <Building2 className="h-6 w-6 text-brand-accent" />,
                title: "Multi-Proyecto",
                desc: "Gestiona docenas de obras o campañas simultáneamente desde un único dashboard centralizado."
              }
            ].map((feature, i) => (
              <div key={i} className="bg-white p-8 rounded-pragmata shadow-sm border border-brand-border hover:shadow-md transition-shadow">
                <div className="mb-4 bg-brand-surface w-12 h-12 rounded-pragmata flex items-center justify-center">
                  {feature.icon}
                </div>
                <h3 className="text-xl font-bold tracking-tighter text-brand-dark mb-3">{feature.title}</h3>
                <p className="text-slate-600 leading-relaxed">{feature.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* --- Contact --- */}
      <section id="contact" className="py-24 bg-white">
        <div className="max-w-5xl mx-auto px-4">
          <div className="bg-brand-dark rounded-pragmata p-8 md:p-16 text-center text-white overflow-hidden relative">
            <div className="relative z-10">
              <h2 className="text-3xl md:text-4xl font-bold tracking-tighter mb-6">¿Listo para transformar tu gestión?</h2>
              <p className="text-slate-300 mb-8 max-w-xl mx-auto text-lg">
                Únete a las empresas que ya están optimizando sus operaciones con Pragmatia.
              </p>
              <div className="bg-white/10 backdrop-blur p-1 rounded-xl max-w-md mx-auto flex items-center">
                <Mail className="ml-4 text-slate-400" />
                <input 
                  type="email" 
                  placeholder="tu@email.com" 
                  className="bg-transparent border-none text-white placeholder:text-slate-400 focus:ring-0 w-full px-4 py-3"
                />
                <Button variant="secondary" className="bg-white text-brand-dark hover:bg-brand-surface border-transparent">
                  Contactar
                </Button>
              </div>
            </div>
            
            {/* Decoration */}
            <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_top_right,_var(--tw-gradient-stops))] from-blue-500/20 via-transparent to-transparent opacity-50"></div>
          </div>
        </div>
      </section>

      {/* --- Footer --- */}
      <footer className="bg-slate-50 border-t border-slate-200 py-12">
        <div className="max-w-7xl mx-auto px-4 text-center md:text-left flex flex-col md:flex-row justify-between items-center text-slate-500 text-sm">
          <div className="mb-4 md:mb-0">
            <span className="font-bold text-slate-700">Pragmatia App</span>
            <span className="mx-2">•</span>
            © {new Date().getFullYear()} Todos los derechos reservados.
          </div>
          <div className="flex gap-6">
            <a href="#" className="hover:text-slate-900">Privacidad</a>
            <a href="#" className="hover:text-slate-900">Términos</a>
            <a href="#" className="hover:text-slate-900">Soporte</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
