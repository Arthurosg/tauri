// Previne janela extra de console no Windows em builds de produção
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::Serialize;
use std::{collections::HashSet, process::Command, sync::{atomic::{AtomicBool, Ordering}, Arc}, thread, time::Duration};
use tauri::{AppHandle, Emitter, Listener, Manager, Window};

#[cfg(target_os = "windows")]
use windows_sys::Win32::{
    Foundation::{HWND, LPARAM, BOOL},
    System::Threading::GetCurrentProcessId,
    UI::WindowsAndMessaging::{
        SetWindowPos, EnumWindows, GetWindowThreadProcessId, GetWindowLongW, SetWindowLongW,
        SetLayeredWindowAttributes,
        HWND_TOPMOST, SWP_NOMOVE, SWP_NOSIZE, SWP_SHOWWINDOW,
        GWL_EXSTYLE, WS_EX_LAYERED, WS_EX_TOPMOST, WS_EX_TRANSPARENT, LWA_ALPHA,
    },
};

const POLL_MS: u64 = 2000; // Polling a cada 2 segundos para detecção rápida

#[derive(Clone, Serialize)]
struct TrackerUpdate { game: Option<String> }

// Apenas processos do JOGO em si (não launcher)
const GAMES: &[(&str, &[&str])] = &[
    ("valorant", &["valorant.exe", "valorant-win64-shipping.exe"]),
    ("lol", &["league of legends.exe"]),
    ("tft", &["league of legends.exe"]),
    ("cs2", &["cs2.exe"]),
];

// Estrutura para passar dados para o callback
#[cfg(target_os = "windows")]
struct EnumData {
    target_pid: u32,
    found_hwnd: Option<HWND>,
}

// Callback para encontrar a janela do processo atual
#[cfg(target_os = "windows")]
unsafe extern "system" fn enum_windows_proc(hwnd: HWND, lparam: LPARAM) -> BOOL {
    let data = &mut *(lparam as *mut EnumData);
    let mut pid: u32 = 0;
    GetWindowThreadProcessId(hwnd, &mut pid);
    
    if pid == data.target_pid && data.found_hwnd.is_none() {
        // Encontrou a janela do processo atual
        data.found_hwnd = Some(hwnd);
        return 0; // Para enumeração após encontrar a primeira janela
    }
    1 // Continua enumeração
}

#[tauri::command]
#[cfg(target_os = "windows")]
fn set_window_topmost_for_fullscreen(_window: Window) -> Result<(), String> {
    unsafe {
        let pid = GetCurrentProcessId();
        let mut data = EnumData {
            target_pid: pid,
            found_hwnd: None,
        };
        
        // Enumera todas as janelas para encontrar a do processo atual
        EnumWindows(Some(enum_windows_proc), &mut data as *mut EnumData as LPARAM);
        
        // Se encontrou a janela, força aparecer sobre tudo (incluindo fullscreen exclusivo)
        if let Some(hwnd) = data.found_hwnd {
            // Obtém o estilo estendido atual
            let ex_style = GetWindowLongW(hwnd, GWL_EXSTYLE) as u32;
            
            // Adiciona flags necessárias para aparecer sobre fullscreen
            // NÃO adiciona WS_EX_TRANSPARENT aqui - isso impede que apareça em fullscreen
            let new_ex_style = ex_style | WS_EX_LAYERED | WS_EX_TOPMOST;
            // Remove WS_EX_TRANSPARENT se estiver (para garantir que apareça)
            let new_ex_style = new_ex_style & !WS_EX_TRANSPARENT;
            
            // Aplica o novo estilo estendido (converte de volta para i32)
            SetWindowLongW(hwnd, GWL_EXSTYLE, new_ex_style as i32);
            
            // Configura a janela como layered (necessário para aparecer sobre fullscreen)
            SetLayeredWindowAttributes(hwnd, 0, 255, LWA_ALPHA);
            
            // Força a janela a aparecer no topo
            SetWindowPos(
                hwnd,
                HWND_TOPMOST,
                0,
                0,
                0,
                0,
                SWP_NOMOVE | SWP_NOSIZE | SWP_SHOWWINDOW,
            );
            
            // Aplica novamente para garantir
            thread::sleep(Duration::from_millis(50));
            SetWindowPos(
                hwnd,
                HWND_TOPMOST,
                0,
                0,
                0,
                0,
                SWP_NOMOVE | SWP_NOSIZE | SWP_SHOWWINDOW,
            );
        }
    }
    Ok(())
}

// Comando para tornar o overlay interativo (remover transparente temporariamente)
#[tauri::command]
#[cfg(target_os = "windows")]
fn set_window_interactive(_window: Window, interactive: bool) -> Result<(), String> {
    unsafe {
        let pid = GetCurrentProcessId();
        let mut data = EnumData {
            target_pid: pid,
            found_hwnd: None,
        };
        
        EnumWindows(Some(enum_windows_proc), &mut data as *mut EnumData as LPARAM);
        
        if let Some(hwnd) = data.found_hwnd {
            let ex_style = GetWindowLongW(hwnd, GWL_EXSTYLE) as u32;
            let new_ex_style = if interactive {
                // Remove WS_EX_TRANSPARENT para permitir interação
                ex_style & !WS_EX_TRANSPARENT
            } else {
                // Adiciona WS_EX_TRANSPARENT para não bloquear eventos do jogo
                ex_style | WS_EX_TRANSPARENT
            };
            
            SetWindowLongW(hwnd, GWL_EXSTYLE, new_ex_style as i32);
        }
    }
    Ok(())
}

#[tauri::command]
#[cfg(not(target_os = "windows"))]
fn set_window_topmost_for_fullscreen(_window: Window) -> Result<(), String> {
    Ok(())
}

#[tauri::command]
#[cfg(not(target_os = "windows"))]
fn set_window_interactive(_window: Window, _interactive: bool) -> Result<(), String> {
    Ok(())
}

// Comando para verificar estado inicial do jogo
#[tauri::command]
fn check_initial_game_state() -> Option<String> {
    detect_game()
}

#[tauri::command]
fn open_browser(url: String) -> Result<(), String> {
    open::that(&url).map_err(|e| format!("Failed to open browser: {}", e))
}

// Handler para receber deep link callback
// Este comando é chamado quando o protocolo prophase:// é ativado
#[tauri::command]
fn handle_oauth_callback(url: String, window: Window) -> Result<(), String> {
    // Emite evento para o frontend processar o callback
    let _ = window.emit("oauth-callback-url", url);
    Ok(())
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_deep_link::init())
        .setup(|app| {
            start_tracker(app.handle().clone());
            
            // Listener para deep links (myapp://callback?code=XXX)
            let app_handle = app.handle().clone();
            app.listen("deep-link://new-url", move |event| {
                // Payload é um array de URLs
                if let Some(urls) = event.payload().strip_prefix('[').and_then(|s| s.strip_suffix(']')) {
                    // Parse do JSON array
                    let url_str = urls.trim_matches('"');
                    if url_str.starts_with("myapp://") || url_str.starts_with("prophase://") {
                        if let Some(window) = app_handle.get_webview_window("main") {
                            let _ = window.emit("oauth-callback-url", url_str);
                        }
                    }
                }
            });
            
            // Também captura argumentos de linha de comando (quando app é iniciado via deep link)
            if let Some(url) = std::env::args().nth(1) {
                if url.starts_with("myapp://") || url.starts_with("prophase://") {
                    let app_handle = app.handle();
                    if let Some(window) = app_handle.get_webview_window("main") {
                        let _ = window.emit("oauth-callback-url", url);
                    }
                }
            }
            
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            set_window_topmost_for_fullscreen, 
            set_window_interactive, 
            check_initial_game_state,
            open_browser,
            handle_oauth_callback
        ])
        .run(tauri::generate_context!())
        .expect("Falha ao iniciar aplicação");
}

fn start_tracker(handle: AppHandle) {
    let running = Arc::new(AtomicBool::new(true));
    let flag = running.clone();
    
    // Para o tracker quando o app fecha
    handle.listen_any("tauri://close-requested", move |_| {
        flag.store(false, Ordering::Relaxed);
    });

    thread::spawn(move || {
        let mut current: Option<String> = None;
        let mut confirm_count = 0u8;
        let mut pending: Option<String> = None;
        
        while running.load(Ordering::Relaxed) {
            let detected = detect_game();
            
            // Debounce: só emite depois de detectar o mesmo estado
            if detected == pending {
                confirm_count += 1;
            } else {
                pending = detected.clone();
                confirm_count = 1;
            }
            
            // Lógica diferente para detectar vs fechar:
            // - Detectar jogo: 2 detecções (4 segundos) - mais rápido para virar overlay
            // - Fechar jogo: 3 detecções (6 segundos) - mais lento para evitar falsos negativos
            let required_count = if pending.is_some() { 2 } else { 3 };
            
            if confirm_count >= required_count && current != pending {
                current = pending.clone();
                let _ = handle.emit("tracker:update", TrackerUpdate { game: current.clone() });
            }
            
            thread::sleep(Duration::from_millis(POLL_MS));
        }
    });
}

fn detect_game() -> Option<String> {
    let procs = get_processes().ok()?;
    GAMES.iter()
        .find(|(_, exes)| exes.iter().any(|e| procs.contains(*e)))
        .map(|(id, _)| id.to_string())
}

#[cfg(target_os = "windows")]
fn get_processes() -> std::io::Result<HashSet<String>> {
    let out = Command::new("tasklist").args(["/FO", "CSV", "/NH"]).output()?;
    Ok(String::from_utf8_lossy(&out.stdout)
        .lines()
        .filter_map(|l| l.split(',').next())
        .map(|n| n.trim_matches('"').to_lowercase())
        .filter(|n| !n.is_empty())
        .collect())
}

#[cfg(not(target_os = "windows"))]
fn get_processes() -> std::io::Result<HashSet<String>> { Ok(HashSet::new()) }
