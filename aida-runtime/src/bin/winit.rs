use std::sync::Arc;

use aida_runtime::{STAGE_HEIGHT, STAGE_WIDTH};
use wgpu::{Device, Instance, Queue, Surface, SurfaceConfiguration, TextureViewDescriptor};
use winit::{
    application::ApplicationHandler,
    dpi::LogicalSize,
    event::WindowEvent,
    event_loop::{ActiveEventLoop, EventLoop},
    window::{Window, WindowId},
};

struct Renderer {
    surface: Surface<'static>,
    device: Device,
    queue: Queue,
    config: SurfaceConfiguration,
}

impl Renderer {
    async fn new(window: Arc<Window>) -> Result<Self, String> {
        let size = window.inner_size();
        let instance = Instance::new(wgpu::InstanceDescriptor::new_without_display_handle());
        let surface = instance
            .create_surface(window)
            .map_err(|error| format!("Could not create wgpu surface: {error}"))?;
        let adapter = instance
            .request_adapter(&wgpu::RequestAdapterOptions {
                compatible_surface: Some(&surface),
                ..Default::default()
            })
            .await
            .map_err(|error| format!("Could not find a graphics adapter: {error}"))?;
        let (device, queue) = adapter
            .request_device(&wgpu::DeviceDescriptor::default())
            .await
            .map_err(|error| format!("Could not create wgpu device: {error}"))?;

        let config = surface
            .get_default_config(&adapter, size.width.max(1), size.height.max(1))
            .ok_or_else(|| "The graphics adapter cannot present to this window".to_string())?;
        surface.configure(&device, &config);

        Ok(Self {
            surface,
            device,
            queue,
            config,
        })
    }

    fn resize(&mut self, width: u32, height: u32) {
        if width == 0 || height == 0 {
            return;
        }
        self.config.width = width;
        self.config.height = height;
        self.surface.configure(&self.device, &self.config);
    }

    fn render(&mut self) -> Result<bool, wgpu::CurrentSurfaceTexture> {
        let (frame, suboptimal) = match self.surface.get_current_texture() {
            wgpu::CurrentSurfaceTexture::Success(frame) => (frame, false),
            wgpu::CurrentSurfaceTexture::Suboptimal(frame) => (frame, true),
            status => return Err(status),
        };
        let view = frame.texture.create_view(&TextureViewDescriptor::default());
        let mut encoder = self
            .device
            .create_command_encoder(&wgpu::CommandEncoderDescriptor {
                label: Some("aida-runtime white backdrop"),
            });
        {
            let _pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                label: Some("aida-runtime white backdrop"),
                color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                    view: &view,
                    depth_slice: None,
                    resolve_target: None,
                    ops: wgpu::Operations {
                        load: wgpu::LoadOp::Clear(wgpu::Color::WHITE),
                        store: wgpu::StoreOp::Store,
                    },
                })],
                depth_stencil_attachment: None,
                timestamp_writes: None,
                occlusion_query_set: None,
                multiview_mask: None,
            });
        }
        self.queue.submit([encoder.finish()]);
        self.queue.present(frame);
        Ok(suboptimal)
    }
}

#[derive(Default)]
struct App {
    window: Option<Arc<Window>>,
    renderer: Option<Renderer>,
}

impl ApplicationHandler for App {
    fn resumed(&mut self, event_loop: &ActiveEventLoop) {
        if self.window.is_some() {
            return;
        }

        let attributes = Window::default_attributes()
            .with_title("Aida Runtime")
            .with_inner_size(LogicalSize::new(STAGE_WIDTH, STAGE_HEIGHT));
        let window = Arc::new(
            event_loop
                .create_window(attributes)
                .expect("Could not create Aida Runtime window"),
        );
        match pollster::block_on(Renderer::new(Arc::clone(&window))) {
            Ok(renderer) => {
                self.renderer = Some(renderer);
                window.request_redraw();
                self.window = Some(window);
            }
            Err(error) => panic!("Could not initialize Aida Runtime: {error}"),
        }
    }

    fn window_event(
        &mut self,
        event_loop: &ActiveEventLoop,
        window_id: WindowId,
        event: WindowEvent,
    ) {
        let Some(window) = self
            .window
            .as_ref()
            .filter(|window| window.id() == window_id)
        else {
            return;
        };
        match event {
            WindowEvent::CloseRequested => event_loop.exit(),
            WindowEvent::Resized(size) => {
                if let Some(renderer) = self.renderer.as_mut() {
                    renderer.resize(size.width, size.height);
                }
                window.request_redraw();
            }
            WindowEvent::RedrawRequested => {
                if let Some(renderer) = self.renderer.as_mut() {
                    match renderer.render() {
                        Ok(true)
                        | Err(
                            wgpu::CurrentSurfaceTexture::Lost
                            | wgpu::CurrentSurfaceTexture::Outdated,
                        ) => {
                            let size = window.inner_size();
                            renderer.resize(size.width, size.height);
                        }
                        Ok(false)
                        | Err(
                            wgpu::CurrentSurfaceTexture::Timeout
                            | wgpu::CurrentSurfaceTexture::Occluded
                            | wgpu::CurrentSurfaceTexture::Validation,
                        ) => {}
                        Err(
                            wgpu::CurrentSurfaceTexture::Success(_)
                            | wgpu::CurrentSurfaceTexture::Suboptimal(_),
                        ) => unreachable!("render only returns surface status errors"),
                    }
                }
            }
            _ => {}
        }
    }
}

fn main() {
    let event_loop = EventLoop::new().expect("Could not create event loop");
    event_loop
        .run_app(&mut App::default())
        .expect("Aida Runtime window failed");
}
