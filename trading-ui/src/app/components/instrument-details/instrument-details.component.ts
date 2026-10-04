import { Component, OnInit, signal, computed, inject, effect, ViewChild, ElementRef, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { InstrumentsService } from '../../api/generated/trade/api/instruments.service';
import { CandlesService } from '../../api/generated/trade/api/candles.service';
import { InstrumentResponse } from '../../api/generated/trade/model/instrument-response';
import Chart from 'chart.js/auto';

/**
 * LEAP-016: Instrument Detail Page
 * Displays:
 * - Instrument name, symbol, exchange
 * - Latest quote (bid, ask, last)
 * - OHLC chart with daily candles (1-year history)
 * - Key statistics
 * - Buy/Sell buttons to place orders
 */
@Component({
  selector: 'app-instrument-details',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './instrument-details.component.html',
  styleUrls: ['./instrument-details.component.css'],
})
export class InstrumentDetailsComponent implements OnInit, AfterViewInit {
  private readonly instrumentsService = inject(InstrumentsService);
  private readonly candlesService = inject(CandlesService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  @ViewChild('chartCanvas') chartCanvas!: ElementRef<HTMLCanvasElement>;
  private chart: Chart | null = null;

  // UI State
  readonly isLoading = signal(false);
  readonly errorMessage = signal('');
  readonly chartLoaded = signal(false);

  // Instrument data
  readonly symbol = signal<string>('');
  readonly instrument = signal<InstrumentResponse | null>(null);

  // Candle data
  readonly candles = signal<any[]>([]);
  readonly candleInterval = signal<string>('1d');

  ngOnInit() {
    // Get symbol from route parameter
    this.route.paramMap.subscribe(params => {
      const sym = params.get('symbol');
      if (sym) {
        this.symbol.set(sym);
        this.loadInstrumentAndCandles(sym);
      }
    });
  }

  ngAfterViewInit() {
    // Chart will be rendered after candles are loaded
    if (this.candles().length > 0 && this.chartCanvas) {
      this.initChart();
    }
  }

  private loadInstrumentAndCandles(sym: string) {
    this.isLoading.set(true);
    this.errorMessage.set('');

    // Fetch instrument details
    this.instrumentsService.getInstruments(20, 0).subscribe({
      next: (response: any) => {
        const instr = response.instruments?.find((i: any) => i.symbol === sym);
        if (instr) {
          this.instrument.set(instr);
          // Fetch candles after instrument is loaded
          this.loadCandles(sym);
        } else {
          this.errorMessage.set(`Instrument ${sym} not found`);
          this.isLoading.set(false);
        }
      },
      error: (err) => {
        this.errorMessage.set('Failed to load instrument data');
        this.isLoading.set(false);
      }
    });
  }

  private loadCandles(sym: string) {
    this.candlesService.getCandles(sym, '1d').subscribe({
      next: (response: any) => {
        if (response && response.candles) {
          this.candles.set(response.candles);
          this.chartLoaded.set(true);
          // Render chart after data is loaded
          setTimeout(() => this.initChart(), 100);
        }
        this.isLoading.set(false);
      },
      error: (err) => {
        console.error('Failed to load candles', err);
        this.errorMessage.set('Failed to load chart data');
        this.isLoading.set(false);
      }
    });
  }

  private initChart() {
    if (!this.chartCanvas || this.candles().length === 0) {
      return;
    }

    // Destroy existing chart if any
    if (this.chart) {
      this.chart.destroy();
    }

    this.createCandlestickChart();
  }

  private getColorVariable(varName: string): string {
    return getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
  }

  private getGridColor(): string {
    // In light mode, use --ink-200 with higher opacity for visibility
    // In dark mode, use --ink-500 (darker) with lower opacity for subtlety
    const isDarkMode = document.documentElement.getAttribute('data-theme') === 'dark';
    const gridBase = isDarkMode ? this.getColorVariable('--ink-500') : this.getColorVariable('--ink-200');
    const opacity = isDarkMode ? '33' : 'CC'; // CC in hex ≈ 0.8 opacity for light mode
    return gridBase + opacity;
  }

  private createCandlestickChart() {
    const dates = this.candles().map((c: any) => c.date?.toString() || '');
    const highs = this.candles().map((c: any) => parseFloat(c.high?.toString() || '0'));
    const lows = this.candles().map((c: any) => parseFloat(c.low?.toString() || '0'));
    const closes = this.candles().map((c: any) => parseFloat(c.close?.toString() || '0'));

    // Read CSS variables for dark mode support
    const blueColor = this.getColorVariable('--info');
    const redColor = this.getColorVariable('--negative');
    const greenColor = this.getColorVariable('--positive');
    const gridColor = this.getGridColor(); // Responsive grid color for light/dark mode
    const textColor = this.getColorVariable('--ink-500'); // Lighter for better readability in dark mode

    this.chart = new Chart(this.chartCanvas!.nativeElement, {
      type: 'line',
      data: {
        labels: dates,
        datasets: [
          {
            label: 'High',
            data: highs,
            borderColor: greenColor,
            backgroundColor: 'transparent',
            borderWidth: 2,
            pointRadius: 0,
            fill: false,
            tension: 0.3,
          },
          {
            label: 'Close',
            data: closes,
            borderColor: blueColor,
            backgroundColor: blueColor + '20',
            borderWidth: 3,
            pointRadius: 0,
            fill: true,
            tension: 0.3,
          },
          {
            label: 'Low',
            data: lows,
            borderColor: redColor,
            backgroundColor: 'transparent',
            borderWidth: 2,
            pointRadius: 0,
            fill: false,
            tension: 0.3,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        interaction: {
          intersect: false,
          mode: 'index',
        },
        plugins: {
          legend: {
            position: 'top',
            labels: {
              font: { size: 12 },
              padding: 15,
              color: this.getColorVariable('--ink-900'),
            },
          },
          title: {
            display: false,
          },
        },
        scales: {
          x: {
            display: true,
            ticks: {
              maxTicksLimit: 20,
              font: { size: 10 },
              color: textColor,
            },
            grid: {
              color: gridColor,
            },
          },
          y: {
            display: true,
            position: 'left',
            ticks: {
              font: { size: 10 },
              color: textColor,
            },
            grid: {
              color: gridColor,
            },
          },
        },
      },
    } as any);
  }

  // Computed stats from candles
  readonly dayRange = computed(() => {
    const candles = this.candles();
    if (candles.length === 0) return { low: 0, high: 0 };
    const low = Math.min(...candles.map((c: any) => Number(c.low)));
    const high = Math.max(...candles.map((c: any) => Number(c.high)));
    return { low, high };
  });

  readonly currentPrice = computed(() => {
    const candles = this.candles();
    if (candles.length === 0) return 0;
    return Number(candles[candles.length - 1]?.close) || 0;
  });

  readonly previousClose = computed(() => {
    const candles = this.candles();
    if (candles.length < 2) return 0;
    return Number(candles[candles.length - 2]?.close) || 0;
  });

  // Navigate to order ticket with symbol pre-filled
  navigateToOrder(side: 'BUY' | 'SELL') {
    this.router.navigate(['/trading'], {
      queryParams: { symbol: this.symbol(), side }
    });
  }

  // Format price for display
  formatPrice(price: number): string {
    return price.toFixed(2);
  }
}
